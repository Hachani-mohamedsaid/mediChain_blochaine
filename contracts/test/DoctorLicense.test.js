const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DoctorLicense + gated issue + dispute", function () {
  async function deployAll() {
    const [admin, doctor, patient, other] = await ethers.getSigners();

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

    const Pay = await ethers.getContractFactory("MediChainPay");
    const pay = await Pay.deploy(
      await chain.getAddress(),
      await doctorReg.getAddress(),
    );
    await pay.waitForDeployment();

    await chain.connect(patient).joinAsPatient();
    await doctorReg.connect(doctor).joinAsDoctor();

    return { admin, doctor, patient, other, chain, license, doctorReg, pay };
  }

  it("blocks issue without license, allows after mint", async function () {
    const { admin, doctor, patient, license, doctorReg } = await deployAll();
    const hash = ethers.id("ordo-1");

    await expect(
      doctorReg.connect(doctor).issueDocument(patient.address, hash, "ordonnance"),
    ).to.be.revertedWithCustomError(doctorReg, "LicenseRequired");

    await license
      .connect(admin)
      .mintLicense(doctor.address, "Cardiologie", "data:application/json,{}");

    await expect(
      doctorReg.connect(doctor).issueDocument(patient.address, hash, "ordonnance"),
    ).to.emit(doctorReg, "DocumentIssued");
  });

  it("escrow dispute then admin split 70/30", async function () {
    const { admin, doctor, patient, license, doctorReg, pay } =
      await deployAll();

    await license
      .connect(admin)
      .mintLicense(doctor.address, "MG", "data:application/json,{}");
    await pay
      .connect(doctor)
      .setConsultationFee(ethers.parseEther("1"));

    const fee = ethers.parseEther("1");
    await pay
      .connect(patient)
      .payConsultation(doctor.address, ethers.ZeroHash, "Consult", {
        value: fee,
      });

    await pay.connect(patient).raiseDispute(1, "no-show");

    const doctorBefore = await ethers.provider.getBalance(doctor.address);
    await pay.connect(admin).resolveDispute(1, 7000);
    const doctorAfter = await ethers.provider.getBalance(doctor.address);

    expect(doctorAfter - doctorBefore).to.equal(ethers.parseEther("0.7"));
    const p = await pay.payments(1);
    expect(Number(p.status)).to.equal(2); // Released
  });
});


