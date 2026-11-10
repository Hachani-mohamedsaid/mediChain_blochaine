const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MediChain", function () {
  it("join → grant → open → revoke", async function () {
    let MediChain;
    try {
      MediChain = await ethers.getContractFactory("MediChain");
    } catch {
      this.skip();
    }
    const [patient, doctor] = await ethers.getSigners();
    const c = await MediChain.deploy();
    await c.waitForDeployment();

    await (await c.connect(patient).joinAsPatient()).wait();
    expect(await c.isPatient(patient.address)).to.equal(true);

    const doc = ethers.id("offchain-doc");
    const expires = Math.floor(Date.now() / 1000) + 7 * 86400;
    const tx = await c.connect(patient).grantAccess(doctor.address, doc, expires);
    await tx.wait();

    expect(await c.hasAccess(doctor.address, 1)).to.equal(true);
    await (await c.connect(doctor).openDocument(1)).wait();
    await (await c.connect(patient).revokeAccess(1)).wait();
    expect(await c.hasAccess(doctor.address, 1)).to.equal(false);
  });
});
