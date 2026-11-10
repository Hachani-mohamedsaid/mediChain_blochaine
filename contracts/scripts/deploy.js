const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const MediChain = await hre.ethers.getContractFactory("MediChain");
  const chain = await MediChain.deploy();
  await chain.waitForDeployment();
  const mediChainAddress = await chain.getAddress();

  const License = await hre.ethers.getContractFactory("DoctorLicenseNFT");
  const license = await License.deploy();
  await license.waitForDeployment();
  const licenseAddress = await license.getAddress();

  const Doctor = await hre.ethers.getContractFactory("MediChainDoctor");
  const doctor = await Doctor.deploy(mediChainAddress, licenseAddress);
  await doctor.waitForDeployment();
  const doctorAddress = await doctor.getAddress();

  const NFT = await hre.ethers.getContractFactory("MedicalRecordNFT");
  const nft = await NFT.deploy(mediChainAddress, doctorAddress);
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();

  const AccessNFT = await hre.ethers.getContractFactory("AccessGrantNFT");
  const accessNft = await AccessNFT.deploy(mediChainAddress);
  await accessNft.waitForDeployment();
  const accessNftAddress = await accessNft.getAddress();

  const Pay = await hre.ethers.getContractFactory("MediChainPay");
  const pay = await Pay.deploy(mediChainAddress, doctorAddress);
  await pay.waitForDeployment();
  const payAddress = await pay.getAddress();

  const Identity = await hre.ethers.getContractFactory("MediChainIdentity");
  const identity = await Identity.deploy();
  await identity.waitForDeployment();
  const identityAddress = await identity.getAddress();

  const Pharmacy = await hre.ethers.getContractFactory("MediChainPharmacy");
  const pharmacy = await Pharmacy.deploy(mediChainAddress);
  await pharmacy.waitForDeployment();
  const pharmacyAddress = await pharmacy.getAddress();

  const Token = await hre.ethers.getContractFactory("MediChainToken");
  const token = await Token.deploy(mediChainAddress);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  await (await token.setPayContract(payAddress)).wait();

  const Supply = await hre.ethers.getContractFactory("MediChainSupply");
  const supply = await Supply.deploy();
  await supply.waitForDeployment();
  const supplyAddress = await supply.getAddress();

  const out = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    MediChain: mediChainAddress,
    DoctorLicenseNFT: licenseAddress,
    MediChainDoctor: doctorAddress,
    MedicalRecordNFT: nftAddress,
    AccessGrantNFT: accessNftAddress,
    MediChainPay: payAddress,
    MediChainIdentity: identityAddress,
    MediChainPharmacy: pharmacyAddress,
    MediChainToken: tokenAddress,
    MediChainSupply: supplyAddress,
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${hre.network.name}.json`),
    JSON.stringify(out, null, 2),
  );

  const backend = path.join(
    __dirname,
    "..",
    "..",
    "backend",
    "src",
    "blockchain",
  );
  fs.mkdirSync(backend, { recursive: true });
  fs.writeFileSync(
    path.join(backend, "addresses.json"),
    JSON.stringify(out, null, 2),
  );

  const artDir = path.join(__dirname, "..", "artifacts", "contracts");
  const copyAbi = (name, destDir) => {
    const src = path.join(artDir, `${name}.sol`, `${name}.json`);
    const json = JSON.parse(fs.readFileSync(src, "utf8"));
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(
      path.join(destDir, `${name}.abi.json`),
      JSON.stringify(json.abi, null, 2),
    );
  };
  const names = [
    "MediChain",
    "MediChainDoctor",
    "MedicalRecordNFT",
    "AccessGrantNFT",
    "MediChainPay",
    "MediChainIdentity",
    "DoctorLicenseNFT",
    "MediChainPharmacy",
    "MediChainToken",
    "MediChainSupply",
  ];
  const fe = path.join(__dirname, "..", "..", "frontend", "src", "abi");
  for (const name of names) {
    copyAbi(name, backend);
    copyAbi(name, fe);
  }
  fs.writeFileSync(path.join(fe, "addresses.json"), JSON.stringify(out, null, 2));

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
