// Tests for every GroveProof rule, plus the five "Try to cheat" attacks shown in the app.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const V = { None: 0, Verified: 1, NeedsReview: 2, NotEligible: 3, CantCheckYet: 4 };
const PRICE = ethers.parseEther("0.001");
const RECIPE = ethers.keccak256(ethers.toUtf8Bytes("recipe-v1"));
const RESULT = ethers.keccak256(ethers.toUtf8Bytes("result-v1"));

// Example H3 cell ids (uint64). Real ids come from h3-js / h3-py.
const FOREST_A = [0x89618928cbbffffn, 0x89618928cb3ffffn, 0x89618928ca7ffffn];
const FOREST_B = [0x8961892a5a3ffffn, 0x8961892a5abffffn];

async function deploy() {
  const [admin, verifier, owner, buyer, stranger] = await ethers.getSigners();
  const GroveProof = await ethers.getContractFactory("GroveProof");
  const gp = await GroveProof.deploy(admin.address, verifier.address, PRICE);
  return { gp, admin, verifier, owner, buyer, stranger };
}

// Register forest A as `owner`, record a Verified verdict with 100 credits, issue `issue` credits.
async function verifiedProject(ctx, issue = 100) {
  const { gp, verifier, owner } = ctx;
  await gp.connect(owner).registerProject(FOREST_A, "ipfs://forest-a");
  await gp.connect(verifier).recordVerification(1, V.Verified, 100, RECIPE, RESULT);
  if (issue > 0) await gp.connect(owner).issueCredits(1, issue);
  return 1n;
}

describe("GroveProof", function () {
  describe("Registering a forest", function () {
    it("registers a forest and remembers who owns each map cell", async function () {
      const { gp, owner } = await deploy();
      await expect(gp.connect(owner).registerProject(FOREST_A, "ipfs://a"))
        .to.emit(gp, "ProjectRegistered");
      expect(await gp.projectCount()).to.equal(1n);
      expect(await gp.cellProject(FOREST_A[0])).to.equal(1n);
      const p = await gp.getProject(1);
      expect(p.owner).to.equal(owner.address);
      expect(p.cellCount).to.equal(3n);
    });

    it("lets a second forest register if it does not overlap", async function () {
      const { gp, owner, stranger } = await deploy();
      await gp.connect(owner).registerProject(FOREST_A, "ipfs://a");
      await gp.connect(stranger).registerProject(FOREST_B, "ipfs://b");
      expect(await gp.projectCount()).to.equal(2n);
    });

    it("refuses an empty project and a project that is too big", async function () {
      const { gp, owner } = await deploy();
      await expect(gp.connect(owner).registerProject([], "x")).to.be.revertedWithCustomError(gp, "NoCells");
      const many = Array.from({ length: 301 }, (_, i) => BigInt(i + 1));
      await expect(gp.connect(owner).registerProject(many, "x"))
        .to.be.revertedWithCustomError(gp, "TooManyCells").withArgs(301, 300);
    });

    it("refuses the same cell listed twice inside one project", async function () {
      const { gp, owner } = await deploy();
      await expect(gp.connect(owner).registerProject([FOREST_A[0], FOREST_A[0]], "x"))
        .to.be.revertedWithCustomError(gp, "AlreadyClaimed");
    });
  });

  describe("Recording the satellite verdict", function () {
    it("only allows Verified projects to get credits", async function () {
      const { gp, verifier, owner } = await deploy();
      await gp.connect(owner).registerProject(FOREST_A, "x");
      await expect(gp.connect(verifier).recordVerification(1, V.NeedsReview, 50, RECIPE, RESULT))
        .to.be.revertedWithCustomError(gp, "CreditsOnlyWhenVerified");
      await gp.connect(verifier).recordVerification(1, V.NotEligible, 0, RECIPE, RESULT);
      await expect(gp.connect(owner).issueCredits(1, 1))
        .to.be.revertedWithCustomError(gp, "NotVerified").withArgs(1, V.NotEligible);
    });

    it("stores the recipe and result hashes for re-running the check", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx, 0);
      const p = await ctx.gp.getProject(1);
      expect(p.recipeHash).to.equal(RECIPE);
      expect(p.resultHash).to.equal(RESULT);
      expect(p.maxCredits).to.equal(100n);
    });

    it("refuses an unknown project", async function () {
      const { gp, verifier } = await deploy();
      await expect(gp.connect(verifier).recordVerification(9, V.Verified, 1, RECIPE, RESULT))
        .to.be.revertedWithCustomError(gp, "UnknownProject");
    });
  });

  describe("Creating, buying and retiring credits", function () {
    it("creates credits up to the verified limit", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx, 60);
      await ctx.gp.connect(ctx.owner).issueCredits(1, 40);
      expect(await ctx.gp.balanceOf(ctx.owner.address, 1)).to.equal(100n);
    });

    it("only the owner can create credits", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx, 0);
      await expect(ctx.gp.connect(ctx.stranger).issueCredits(1, 1))
        .to.be.revertedWithCustomError(ctx.gp, "NotProjectOwner");
    });

    it("sells credits at the fixed price and pays the owner", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx);
      const before = await ethers.provider.getBalance(ctx.owner.address);
      await expect(ctx.gp.connect(ctx.buyer).buy(1, 10, { value: PRICE * 10n }))
        .to.emit(ctx.gp, "CreditsBought");
      expect(await ctx.gp.balanceOf(ctx.buyer.address, 1)).to.equal(10n);
      expect(await ethers.provider.getBalance(ctx.owner.address)).to.equal(before + PRICE * 10n);
    });

    it("refuses the wrong payment", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx);
      await expect(ctx.gp.connect(ctx.buyer).buy(1, 10, { value: PRICE }))
        .to.be.revertedWithCustomError(ctx.gp, "WrongPayment");
    });

    it("retires credits, burns them and stores a retirement record", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx);
      await ctx.gp.connect(ctx.buyer).buy(1, 10, { value: PRICE * 10n });
      await expect(ctx.gp.connect(ctx.buyer).retire(1, 10, "Green Tea Co. 2026"))
        .to.emit(ctx.gp, "CreditsRetired").withArgs(1, 1, ctx.buyer.address, 10, "Green Tea Co. 2026");
      expect(await ctx.gp.balanceOf(ctx.buyer.address, 1)).to.equal(0n);
      const r = await ctx.gp.getRetirement(1);
      expect(r.amount).to.equal(10n);
      expect((await ctx.gp.getProject(1)).retired).to.equal(10n);
    });

    it("needs a beneficiary name to retire", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx);
      await expect(ctx.gp.connect(ctx.owner).retire(1, 1, ""))
        .to.be.revertedWithCustomError(ctx.gp, "EmptyBeneficiary");
    });
  });

  describe("Living credits: re-checks", function () {
    it("a small loss does not freeze the project", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx);
      await ctx.gp.connect(ctx.verifier).recordRecheck(1, 120, RECIPE, RESULT); // 1.2%
      expect((await ctx.gp.getProject(1)).frozen).to.equal(false);
    });

    it("a major loss freezes the project; retired credits stay retired", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx);
      await ctx.gp.connect(ctx.owner).retire(1, 5, "Early buyer");
      await expect(ctx.gp.connect(ctx.verifier).recordRecheck(1, 1800, RECIPE, RESULT)) // 18%
        .to.emit(ctx.gp, "ProjectFrozen").withArgs(1, 1800);
      const p = await ctx.gp.getProject(1);
      expect(p.frozen).to.equal(true);
      expect(p.verdict).to.equal(V.NotEligible);
      expect(p.retired).to.equal(5n);
      expect((await ctx.gp.getRetirement(1)).amount).to.equal(5n);
    });

    it("a frozen project cannot create, transfer or retire credits", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx, 50);
      await ctx.gp.connect(ctx.verifier).recordRecheck(1, 900, RECIPE, RESULT);
      await expect(ctx.gp.connect(ctx.owner).issueCredits(1, 1))
        .to.be.revertedWithCustomError(ctx.gp, "ProjectIsFrozen");
      await expect(ctx.gp.connect(ctx.owner).safeTransferFrom(ctx.owner.address, ctx.buyer.address, 1, 1, "0x"))
        .to.be.revertedWithCustomError(ctx.gp, "ProjectIsFrozen");
      await expect(ctx.gp.connect(ctx.owner).retire(1, 1, "late"))
        .to.be.revertedWithCustomError(ctx.gp, "ProjectIsFrozen");
      await expect(ctx.gp.connect(ctx.verifier).recordVerification(1, V.Verified, 200, RECIPE, RESULT))
        .to.be.revertedWithCustomError(ctx.gp, "ProjectIsFrozen");
    });
  });

  // These five match the buttons of the "Try to cheat" panel in the website.
  describe("Try to cheat (every attack must be refused)", function () {
    it("Attack 1: retire the same credit twice", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx, 10);
      await ctx.gp.connect(ctx.owner).retire(1, 10, "Company A");
      await expect(ctx.gp.connect(ctx.owner).retire(1, 10, "Company B"))
        .to.be.revertedWithCustomError(ctx.gp, "NotEnoughCredits").withArgs(0, 10);
    });

    it("Attack 2: create more credits than the satellites allow", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx, 0);
      await expect(ctx.gp.connect(ctx.owner).issueCredits(1, 101))
        .to.be.revertedWithCustomError(ctx.gp, "ExceedsVerifiedCredits").withArgs(101, 100);
      await ctx.gp.connect(ctx.owner).issueCredits(1, 100);
      await expect(ctx.gp.connect(ctx.owner).issueCredits(1, 1))
        .to.be.revertedWithCustomError(ctx.gp, "ExceedsVerifiedCredits").withArgs(1, 0);
    });

    it("Attack 3: register land that is already claimed", async function () {
      const { gp, owner, stranger } = await deploy();
      await gp.connect(owner).registerProject(FOREST_A, "ipfs://a");
      const overlapping = [FOREST_B[0], FOREST_A[1]];
      await expect(gp.connect(stranger).registerProject(overlapping, "ipfs://copy"))
        .to.be.revertedWithCustomError(gp, "AlreadyClaimed").withArgs(FOREST_A[1], 1);
      expect(await gp.projectCount()).to.equal(1n); // nothing was saved
      expect(await gp.cellProject(FOREST_B[0])).to.equal(0n);
    });

    it("Attack 4: buy credits from a frozen forest", async function () {
      const ctx = await deploy();
      await verifiedProject(ctx);
      await ctx.gp.connect(ctx.verifier).recordRecheck(1, 1200, RECIPE, RESULT);
      await expect(ctx.gp.connect(ctx.buyer).buy(1, 1, { value: PRICE }))
        .to.be.revertedWithCustomError(ctx.gp, "ProjectIsFrozen").withArgs(1);
    });

    it("Attack 5: record a verification without being the verifier", async function () {
      const ctx = await deploy();
      await ctx.gp.connect(ctx.owner).registerProject(FOREST_A, "x");
      await expect(ctx.gp.connect(ctx.owner).recordVerification(1, V.Verified, 1_000_000, RECIPE, RESULT))
        .to.be.revertedWithCustomError(ctx.gp, "AccessControlUnauthorizedAccount");
      await expect(ctx.gp.connect(ctx.owner).recordRecheck(1, 0, RECIPE, RESULT))
        .to.be.revertedWithCustomError(ctx.gp, "AccessControlUnauthorizedAccount");
    });
  });
});
