// Prints the gas used to register a full-size (300 cell) forest, for the README.
const { ethers } = require("hardhat");
describe("Gas", function () {
  it("registering a 300-cell forest", async function () {
    const [a] = await ethers.getSigners();
    const gp = await (await ethers.getContractFactory("GroveProof")).deploy(a.address, a.address, 1);
    const cells = Array.from({ length: 300 }, (_, i) => 0x89618928c000000n + BigInt(i) * 0x8000000n);
    const rc = await (await gp.registerProject(cells, "ipfs://big")).wait();
    console.log(`      gas for 300 cells: ${rc.gasUsed}`);
  });
});
