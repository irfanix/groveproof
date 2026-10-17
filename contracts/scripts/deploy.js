// Deploy GroveProof to Polygon Amoy (or the local Hardhat network).
// Usage: npx hardhat run scripts/deploy.js --network amoy
// It writes the address + ABI to ../shared/deployment.json for the verifier and website.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const verifier = process.env.VERIFIER_ADDRESS || deployer.address;
  const price = ethers.parseEther(process.env.PRICE_PER_CREDIT || "0.001");

  console.log(`Deploying from ${deployer.address} on ${network.name}`);
  const GroveProof = await ethers.getContractFactory("GroveProof");
  const gp = await GroveProof.deploy(deployer.address, verifier, price);
  await gp.waitForDeployment();
  const deployBlock = (await gp.deploymentTransaction().wait()).blockNumber;
  const address = await gp.getAddress();
  console.log(`GroveProof deployed at ${address}`);
  console.log(`Verifier role given to ${verifier}`);

  const artifact = require("../artifacts/contracts/GroveProof.sol/GroveProof.json");
  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    address,
    verifier,
    pricePerCreditWei: price.toString(),
    deployBlock,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };
  const dir = path.join(__dirname, "..", "..", "shared");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "deployment.json"), JSON.stringify(out, null, 2));
  console.log("Saved shared/deployment.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
