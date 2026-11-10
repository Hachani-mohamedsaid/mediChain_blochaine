const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

/** Déploie seulement MediChainSupply et met à jour addresses.json */
async function main() {
  const Supply = await hre.ethers.getContractFactory("MediChainSupply");
  const supply = await Supply.deploy();
  await supply.waitForDeployment();
  const supplyAddress = await supply.getAddress();

  const art = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "MediChainSupply.sol",
    "MediChainSupply.json",
  );
  const { abi } = JSON.parse(fs.readFileSync(art, "utf8"));

  const targets = [
    path.join(__dirname, "..", "..", "frontend", "src", "abi"),
    path.join(__dirname, "..", "..", "backend", "src", "blockchain"),
    path.join(__dirname, "..", "deployments"),
  ];

  for (const dir of targets) {
    fs.mkdirSync(dir, { recursive: true });
    const addrPath = path.join(
      dir,
      dir.endsWith("deployments") ? "localhost.json" : "addresses.json",
    );
    let prev = {};
    if (fs.existsSync(addrPath)) {
      prev = JSON.parse(fs.readFileSync(addrPath, "utf8"));
    }
    const next = {
      ...prev,
      MediChainSupply: supplyAddress,
      supplyDeployedAt: new Date().toISOString(),
    };
    fs.writeFileSync(addrPath, JSON.stringify(next, null, 2));
    if (!dir.endsWith("deployments")) {
      fs.writeFileSync(
        path.join(dir, "MediChainSupply.abi.json"),
        JSON.stringify(abi, null, 2),
      );
    }
  }

  console.log(JSON.stringify({ MediChainSupply: supplyAddress }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
