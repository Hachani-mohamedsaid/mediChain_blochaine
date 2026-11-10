// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMediChainPatients {
    function isPatient(address account) external view returns (bool);
}

interface IMediChainDoctors {
    function isDoctor(address account) external view returns (bool);
}

interface IDoctorLicense {
    function hasValidLicense(address doctor) external view returns (bool);
}
