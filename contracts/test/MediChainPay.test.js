const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MediChainPay", function () {
  async function deploy() {
    const [admin, patient, doctor] = await ethers.getSigners();
    const MediChain = await ethers.getContractFactory("MediChain");
    const chain = await MediChain.deploy();
    const License = await ethers.getContractFactory("DoctorLicenseNFT");
    const license = await License.deploy();
    const Doctor = await ethers.getContractFactory("MediChainDoctor");
    const doc = await Doctor.deploy(
      await chain.getAddress(),
      await license.getAddress(),
    );
    const Pay = await ethers.getContractFactory("MediChainPay");
    const pay = await Pay.deploy(
      await chain.getAddress(),
      await doc.getAddress(),
    );
    await chain.connect(patient).joinAsPatient();
    await doc.connect(doctor).joinAsDoctor();
    await license
      .connect(admin)
      .mintLicense(doctor.address, "MG", "data:application/json,{}");
    return { chain, doc, pay, admin, patient, doctor };
  }

  it("locks ETH then doctor releases by docHash", async function () {
    const { pay, patient, doctor } = await deploy();
    const fee = ethers.parseEther("0.05");
    await pay.connect(doctor).setConsultationFee(fee);
    const hash = ethers.id("ordo-1");

    await pay
      .connect(patient)
      .payConsultation(doctor.address, hash, "Consultation", { value: fee });

    expect(await ethers.provider.getBalance(await pay.getAddress())).to.equal(
      fee,
    );
    expect((await pay.payments(1)).status).to.equal(1n); // Locked

    const balBefore = await ethers.provider.getBalance(doctor.address);
    const tx = await pay.connect(doctor).releaseByDocHash(hash);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const balAfter = await ethers.provider.getBalance(doctor.address);
    expect(balAfter + gas - balBefore).to.equal(fee);
    expect((await pay.payments(1)).status).to.equal(2n); // Released
  });

  it("rejects underpayment", async function () {
    const { pay, patient, doctor } = await deploy();
    await pay.connect(doctor).setConsultationFee(ethers.parseEther("1"));
    await expect(
      pay
        .connect(patient)
        .payConsultation(doctor.address, ethers.id("x"), "x", {
          value: ethers.parseEther("0.1"),
        }),
    ).to.be.reverted;
  });

  it("patient refunds after timeout", async function () {
    const { pay, patient, doctor } = await deploy();
    const fee = ethers.parseEther("0.02");
    await pay.connect(doctor).setConsultationFee(fee);
    await pay
      .connect(patient)
      .payConsultation(doctor.address, ethers.id("r"), "r", { value: fee });

    await expect(pay.connect(patient).refundPayment(1)).to.be.reverted;

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    const before = await ethers.provider.getBalance(patient.address);
    const tx = await pay.connect(patient).refundPayment(1);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(patient.address);
    expect(after + gas - before).to.equal(fee);
    expect((await pay.payments(1)).status).to.equal(3n); // Refunded
  });
});
