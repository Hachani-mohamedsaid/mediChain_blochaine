// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IMediChainPatients, IDoctorLicense} from "./Interfaces.sol";

/// Émission médecin (hash only) — licence soulbound requise
contract MediChainDoctor {
    IMediChainPatients public immutable mediChain;
    IDoctorLicense public immutable licenseNft;
    address public immutable admin;
    uint256 public nextIssueId = 1;
    bool public requireLicense = true;
    mapping(address => bool) public isDoctor;

    struct IssuedDoc {
        address doctor;
        address patient;
        bytes32 docHash;
        string kind;
        uint64 issuedAt;
    }
    mapping(uint256 => IssuedDoc) public issues;

    event DoctorJoined(address indexed doctor);
    event LicenseRequirementSet(bool required);
    event DocumentIssued(uint256 indexed issueId, address indexed doctor, address indexed patient, bytes32 docHash, string kind);

    error LicenseRequired();

    constructor(address mediChain_, address licenseNft_) {
        admin = msg.sender;
        mediChain = IMediChainPatients(mediChain_);
        licenseNft = IDoctorLicense(licenseNft_);
    }

    function setRequireLicense(bool required) external {
        require(msg.sender == admin, "admin");
        requireLicense = required;
        emit LicenseRequirementSet(required);
    }

    function joinAsDoctor() external {
        require(!isDoctor[msg.sender], "already");
        isDoctor[msg.sender] = true;
        emit DoctorJoined(msg.sender);
    }

    function issueDocument(address patient, bytes32 docHash, string calldata kind) external returns (uint256 issueId) {
        require(isDoctor[msg.sender], "not doctor");
        if (requireLicense && !licenseNft.hasValidLicense(msg.sender)) revert LicenseRequired();
        require(patient != address(0) && docHash != bytes32(0), "bad args");
        require(mediChain.isPatient(patient), "not patient");

        issueId = nextIssueId++;
        issues[issueId] = IssuedDoc(msg.sender, patient, docHash, kind, uint64(block.timestamp));
        emit DocumentIssued(issueId, msg.sender, patient, docHash, kind);
    }
}
