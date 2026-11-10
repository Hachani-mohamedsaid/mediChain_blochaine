// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Accès patient : grant / revoke / open (fichier = off-chain)
contract MediChain {
    address public immutable admin;
    uint256 public nextGrantId = 1;
    mapping(address => bool) public isPatient;

    struct Grant {
        address patient;
        address doctor;
        bytes32 docHash;
        uint64 expiresAt;
        bool revoked;
    }
    mapping(uint256 => Grant) public grants;

    event PatientJoined(address indexed patient);
    event AccessGranted(uint256 indexed grantId, address indexed patient, address indexed doctor, bytes32 docHash, uint64 expiresAt);
    event AccessRevoked(uint256 indexed grantId, address indexed patient);
    event DocumentOpened(uint256 indexed grantId, address indexed doctor);

    constructor() {
        admin = msg.sender;
    }

    function joinAsPatient() external {
        require(!isPatient[msg.sender], "already");
        isPatient[msg.sender] = true;
        emit PatientJoined(msg.sender);
    }

    function grantAccess(address doctor, bytes32 docHash, uint64 expiresAt) external returns (uint256 id) {
        require(isPatient[msg.sender], "not patient");
        require(doctor != address(0) && docHash != bytes32(0), "bad args");
        require(expiresAt > block.timestamp, "expired");
        id = nextGrantId++;
        grants[id] = Grant(msg.sender, doctor, docHash, expiresAt, false);
        emit AccessGranted(id, msg.sender, doctor, docHash, expiresAt);
    }

    function revokeAccess(uint256 grantId) external {
        Grant storage g = grants[grantId];
        require(g.patient == msg.sender && !g.revoked, "denied");
        g.revoked = true;
        emit AccessRevoked(grantId, msg.sender);
    }

    function hasAccess(address doctor, uint256 grantId) public view returns (bool) {
        Grant storage g = grants[grantId];
        return g.doctor == doctor && !g.revoked && g.patient != address(0) && block.timestamp <= g.expiresAt;
    }

    function openDocument(uint256 grantId) external {
        require(hasAccess(msg.sender, grantId), "denied");
        emit DocumentOpened(grantId, msg.sender);
    }
}
