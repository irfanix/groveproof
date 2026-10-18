// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 * GroveProof: satellite-verified forest carbon credits.
 *
 * Forest carbon credits that can only be created after a satellite check, for land registered once.
 *
 * Simple idea:
 *  - A forest project is a list of H3 map cells (resolution 9, about 0.1 km2 each).
 *  - A map cell can belong to only ONE project, so the same land can never be claimed twice.
 *  - Only the verifier (the satellite checking service) can record a verdict.
 *  - The owner can create credits only up to the number the satellites allowed.
 *  - Credits can be bought and retired. A retired credit is burned, so it can never be used again.
 *  - If a re-check finds major tree loss, the project is frozen: its credits can no longer
 *    be created, bought, transferred or retired.
 *
 * This is a hackathon prototype on a testnet. It is not an official carbon registry.
 */

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GroveProof is ERC1155, AccessControl, ReentrancyGuard {
    // ---------------------------------------------------------------- roles and settings

    /// The satellite checking service. Only it can record verdicts and re-checks.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// Most map cells one project may use (keeps gas low; about 30 km2).
    uint256 public constant MAX_CELLS = 300;

    /// Tree loss (in basis points, 500 = 5%) at which a re-check freezes the project.
    uint256 public constant FREEZE_LOSS_BPS = 500;

    /// Fixed test price of one credit, in wei of the testnet coin.
    uint256 public immutable pricePerCredit;

    // ---------------------------------------------------------------- data

    enum Verdict {
        None,          // not checked yet
        Verified,      // satellites clearly show healthy forest
        NeedsReview,   // evidence not strong enough
        NotEligible,   // major tree loss
        CantCheckYet   // too cloudy
    }

    struct Project {
        address owner;
        string metadataURI;
        uint256 cellCount;
        Verdict verdict;
        uint256 maxCredits;   // most credits the satellites allow
        uint256 issued;       // credits created so far
        uint256 retired;      // credits retired so far
        bytes32 recipeHash;   // hash of the exact recipe of the last check (for "Re-run this check")
        bytes32 resultHash;   // hash of the result of the last check
        uint256 lastLossBps;  // tree loss found by the last re-check
        bool frozen;          // true after a re-check finds major loss
        uint64 checkedAt;     // time of the last verification or re-check
    }

    struct Retirement {
        uint256 projectId;
        address by;
        uint256 amount;
        string beneficiary;
        uint64 at;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) private _projects;

    /// map cell => project id that claimed it (0 = free)
    mapping(uint64 => uint256) public cellProject;

    uint256 public retirementCount;
    mapping(uint256 => Retirement) private _retirements;

    // ---------------------------------------------------------------- events (the public history)

    event ProjectRegistered(uint256 indexed projectId, address indexed owner, uint64[] cells, string metadataURI);
    event VerificationRecorded(uint256 indexed projectId, Verdict verdict, uint256 maxCredits, bytes32 recipeHash, bytes32 resultHash);
    event CreditsIssued(uint256 indexed projectId, address indexed owner, uint256 amount);
    event CreditsBought(uint256 indexed projectId, address indexed buyer, address indexed seller, uint256 amount, uint256 paid);
    event CreditsRetired(uint256 indexed retirementId, uint256 indexed projectId, address indexed by, uint256 amount, string beneficiary);
    event Rechecked(uint256 indexed projectId, uint256 lossBps, bytes32 recipeHash, bytes32 resultHash);
    event ProjectFrozen(uint256 indexed projectId, uint256 lossBps);

    // ---------------------------------------------------------------- clear refusal reasons

    error AlreadyClaimed(uint64 cell, uint256 existingProjectId);
    error NoCells();
    error TooManyCells(uint256 given, uint256 max);
    error UnknownProject(uint256 projectId);
    error NotProjectOwner(uint256 projectId);
    error NotVerified(uint256 projectId, Verdict verdict);
    error ExceedsVerifiedCredits(uint256 requested, uint256 available);
    error ProjectIsFrozen(uint256 projectId);
    error NotEnoughCredits(uint256 have, uint256 want);
    error WrongPayment(uint256 sent, uint256 expected);
    error ZeroAmount();
    error CreditsOnlyWhenVerified();
    error BelowIssued(uint256 maxCredits, uint256 alreadyIssued);
    error PaymentFailed();
    error EmptyBeneficiary();

    // ---------------------------------------------------------------- setup

    constructor(address admin, address verifier, uint256 pricePerCredit_) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, verifier);
        pricePerCredit = pricePerCredit_;
    }

    modifier projectExists(uint256 projectId) {
        if (projectId == 0 || projectId > projectCount) revert UnknownProject(projectId);
        _;
    }

    // ---------------------------------------------------------------- 1. register a forest

    /// Register a forest as a list of H3 cells. Refused if any cell is already claimed.
    function registerProject(uint64[] calldata cells, string calldata metadataURI) external returns (uint256 projectId) {
        if (cells.length == 0) revert NoCells();
        if (cells.length > MAX_CELLS) revert TooManyCells(cells.length, MAX_CELLS);

        projectId = ++projectCount;
        for (uint256 i = 0; i < cells.length; i++) {
            uint64 cell = cells[i];
            uint256 existing = cellProject[cell];
            // also catches the same cell listed twice in one project
            if (existing != 0) revert AlreadyClaimed(cell, existing);
            cellProject[cell] = projectId;
        }

        Project storage p = _projects[projectId];
        p.owner = msg.sender;
        p.metadataURI = metadataURI;
        p.cellCount = cells.length;

        emit ProjectRegistered(projectId, msg.sender, cells, metadataURI);
    }

    // ---------------------------------------------------------------- 2. record the satellite verdict

    function recordVerification(
        uint256 projectId,
        Verdict verdict,
        uint256 maxCredits,
        bytes32 recipeHash,
        bytes32 resultHash
    ) external onlyRole(VERIFIER_ROLE) projectExists(projectId) {
        Project storage p = _projects[projectId];
        if (p.frozen) revert ProjectIsFrozen(projectId);
        if (verdict != Verdict.Verified && maxCredits != 0) revert CreditsOnlyWhenVerified();
        if (verdict == Verdict.Verified && maxCredits < p.issued) revert BelowIssued(maxCredits, p.issued);

        p.verdict = verdict;
        p.maxCredits = verdict == Verdict.Verified ? maxCredits : p.issued; // no new credits unless Verified
        p.recipeHash = recipeHash;
        p.resultHash = resultHash;
        p.checkedAt = uint64(block.timestamp);

        emit VerificationRecorded(projectId, verdict, maxCredits, recipeHash, resultHash);
    }

    // ---------------------------------------------------------------- 3. create credits

    function issueCredits(uint256 projectId, uint256 amount) external projectExists(projectId) {
        Project storage p = _projects[projectId];
        if (msg.sender != p.owner) revert NotProjectOwner(projectId);
        if (p.frozen) revert ProjectIsFrozen(projectId);
        if (p.verdict != Verdict.Verified) revert NotVerified(projectId, p.verdict);
        if (amount == 0) revert ZeroAmount();
        uint256 available = p.maxCredits - p.issued;
        if (amount > available) revert ExceedsVerifiedCredits(amount, available);

        p.issued += amount;
        _mint(p.owner, projectId, amount, "");
        emit CreditsIssued(projectId, p.owner, amount);
    }

    // ---------------------------------------------------------------- 4. buy credits from the owner

    function buy(uint256 projectId, uint256 amount) external payable nonReentrant projectExists(projectId) {
        Project storage p = _projects[projectId];
        if (p.frozen) revert ProjectIsFrozen(projectId);
        if (amount == 0) revert ZeroAmount();
        uint256 expected = amount * pricePerCredit;
        if (msg.value != expected) revert WrongPayment(msg.value, expected);
        uint256 have = balanceOf(p.owner, projectId);
        if (have < amount) revert NotEnoughCredits(have, amount);

        address seller = p.owner;
        _safeTransferFrom(seller, msg.sender, projectId, amount, "");

        (bool ok, ) = payable(seller).call{value: msg.value}("");
        if (!ok) revert PaymentFailed();

        emit CreditsBought(projectId, msg.sender, seller, amount, msg.value);
    }

    // ---------------------------------------------------------------- 5. retire credits (use them for a climate claim)

    function retire(uint256 projectId, uint256 amount, string calldata beneficiary)
        external
        projectExists(projectId)
        returns (uint256 retirementId)
    {
        Project storage p = _projects[projectId];
        if (p.frozen) revert ProjectIsFrozen(projectId);
        if (amount == 0) revert ZeroAmount();
        if (bytes(beneficiary).length == 0) revert EmptyBeneficiary();
        uint256 have = balanceOf(msg.sender, projectId);
        if (have < amount) revert NotEnoughCredits(have, amount);

        _burn(msg.sender, projectId, amount); // burned: can never be retired or sold again
        p.retired += amount;

        retirementId = ++retirementCount;
        _retirements[retirementId] = Retirement(projectId, msg.sender, amount, beneficiary, uint64(block.timestamp));
        emit CreditsRetired(retirementId, projectId, msg.sender, amount, beneficiary);
    }

    // ---------------------------------------------------------------- 6. living credits: re-check the forest

    function recordRecheck(uint256 projectId, uint256 lossBps, bytes32 recipeHash, bytes32 resultHash)
        external
        onlyRole(VERIFIER_ROLE)
        projectExists(projectId)
    {
        Project storage p = _projects[projectId];
        p.lastLossBps = lossBps;
        p.recipeHash = recipeHash;
        p.resultHash = resultHash;
        p.checkedAt = uint64(block.timestamp);
        emit Rechecked(projectId, lossBps, recipeHash, resultHash);

        if (lossBps >= FREEZE_LOSS_BPS && !p.frozen) {
            p.frozen = true;
            p.verdict = Verdict.NotEligible;
            p.maxCredits = p.issued; // no more credits can ever be created
            emit ProjectFrozen(projectId, lossBps);
        }
    }

    // ---------------------------------------------------------------- read helpers

    function getProject(uint256 projectId) external view projectExists(projectId) returns (Project memory) {
        return _projects[projectId];
    }

    function getRetirement(uint256 retirementId) external view returns (Retirement memory) {
        return _retirements[retirementId];
    }

    function uri(uint256 projectId) public view override returns (string memory) {
        return _projects[projectId].metadataURI;
    }

    // ---------------------------------------------------------------- frozen credits cannot move

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (_projects[ids[i]].frozen) revert ProjectIsFrozen(ids[i]);
            }
        }
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
