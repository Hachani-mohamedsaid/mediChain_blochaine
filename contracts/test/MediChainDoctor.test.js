const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MediChainDoctor", function () {
  it("doctor joins and issues ordonnance to patient", async function () {
    const [admin, patient, doctor, stranger] = await ethers.getSigners();

    const MediChain = await ethers.getContractFactory("MediChain");
    const chain = await MediChain.deploy();
    await chain.waitForDeployment();

    const License = await ethers.getContractFactory("DoctorLicenseNFT");
    const license = await License.deploy();
    await license.waitForDeployment();

    const Doctor = await ethers.getContractFactory("MediChainDoctor");
    const doc = await Doctor.deploy(
      await chain.getAddress(),
      await license.getAddress(),
    );
    await doc.waitForDeployment();

    await (await chain.connect(patient).joinAsPatient()).wait();
    await (await doc.connect(doctor).joinAsDoctor()).wait();
    expect(await doc.isDoctor(doctor.address)).to.equal(true);

    await license
      .connect(admin)
      .mintLicense(doctor.address, "MG", "data:application/json,{}");

    const hash = ethers.id("ordo-pdf");
    await expect(
      doc.connect(doctor).issueDocument(patient.address, hash, "ordonnance"),
    )
      .to.emit(doc, "DocumentIssued")
      .withArgs(1, doctor.address, patient.address, hash, "ordonnance");

    const issued = await doc.issues(1);
    expect(issued.doctor).to.equal(doctor.address);
    expect(issued.kind).to.equal("ordonnance");

    await expect(
      doc.connect(stranger).issueDocument(patient.address, hash, "ordonnance"),
    ).to.be.reverted;

    await expect(
      doc
        .connect(doctor)
        .issueDocument(stranger.address, hash, "certificat"),
    ).to.be.reverted;
  });
});
