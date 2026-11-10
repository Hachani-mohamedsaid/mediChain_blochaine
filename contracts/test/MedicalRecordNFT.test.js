const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MedicalRecordNFT", function () {
  async function deployFixture() {
    const [patient, doctor, other] = await ethers.getSigners();
    const MediChain = await ethers.getContractFactory("MediChain");
    const chain = await MediChain.deploy();
    await chain.waitForDeployment();

    const License = await ethers.getContractFactory("DoctorLicenseNFT");
    const license = await License.deploy();
    await license.waitForDeployment();

    const Doctor = await ethers.getContractFactory("MediChainDoctor");
    const doctorReg = await Doctor.deploy(
      await chain.getAddress(),
      await license.getAddress(),
    );
    await doctorReg.waitForDeployment();

    const NFT = await ethers.getContractFactory("MedicalRecordNFT");
    const nft = await NFT.deploy(
      await chain.getAddress(),
      await doctorReg.getAddress(),
    );
    await nft.waitForDeployment();

    return { patient, doctor, other, chain, doctorReg, nft, license };
  }

  it("mint soulbound after join; transfer reverts", async function () {
    const { patient, other, chain, nft } = await deployFixture();

    await expect(nft.connect(patient).mint(ethers.id("doc"), "ipfs://x")).to.be
      .reverted;

    await (await chain.connect(patient).joinAsPatient()).wait();
    const tx = await nft
      .connect(patient)
      .mint(ethers.id("doc"), "data:application/json,{}");
    await tx.wait();

    expect(await nft.ownerOf(1)).to.equal(patient.address);
    expect(await nft.tokenOfHash(ethers.id("doc"))).to.equal(1n);

    await expect(
      nft.connect(patient).transferFrom(patient.address, other.address, 1),
    ).to.be.reverted;

    await expect(
      nft.connect(patient).mint(ethers.id("doc"), "dup"),
    ).to.be.reverted;
  });

  it("doctor mintForPatient after consultation roles joined", async function () {
    const { patient, doctor, chain, doctorReg, nft, license } =
      await deployFixture();

    await (await chain.connect(patient).joinAsPatient()).wait();
    await (await doctorReg.connect(doctor).joinAsDoctor()).wait();
    await (
      await license.mintLicense(doctor.address, "Générale", "data:,lic")
    ).wait();

    await expect(
      nft
        .connect(doctor)
        .mintForPatient(patient.address, ethers.id("ordo"), "data:,nft"),
    ).to.not.be.reverted;

    expect(await nft.ownerOf(1)).to.equal(patient.address);
    expect(await nft.tokenOfHash(ethers.id("ordo"))).to.equal(1n);
  });
});
