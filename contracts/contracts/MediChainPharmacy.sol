// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IMediChainPatients} from "./Interfaces.sol";

/// Partage d'ordonnance patient → pharmacie + délivrance on-chain
contract MediChainPharmacy {
    IMediChainPatients public immutable mediChain;
    address public immutable admin;
    uint256 public nextShareId = 1;
    mapping(address => bool) public isPharmacy;

    enum Status {
        None,
        Shared,
        Dispensed
    }

    struct PrescriptionShare {
        address patient;
        address pharmacy;
        bytes32 docHash;
        string memo;
        uint64 sharedAt;
        Status status;
    }

    mapping(uint256 => PrescriptionShare) public shares;

    event PharmacyJoined(address indexed pharmacy);
    event PrescriptionShared(
        uint256 indexed shareId,
        address indexed patient,
        address indexed pharmacy,
        bytes32 docHash,
        string memo
    );
    event PrescriptionDispensed(
        uint256 indexed shareId,
        address indexed pharmacy,
        address indexed patient
    );

    constructor(address mediChain_) {
        admin = msg.sender;
        mediChain = IMediChainPatients(mediChain_);
    }

    /// Conservé pour compat — les pharmacies sont déjà considérées inscrites.
    function joinAsPharmacy() external {
        if (isPharmacy[msg.sender]) return;
        isPharmacy[msg.sender] = true;
        emit PharmacyJoined(msg.sender);
    }

    function sharePrescription(
        address pharmacy,
        bytes32 docHash,
        string calldata memo
    ) external returns (uint256 shareId) {
        require(mediChain.isPatient(msg.sender), "not patient");
        require(pharmacy != address(0), "bad pharmacy");
        require(docHash != bytes32(0), "bad hash");

        // Toute pharmacie est au registre par défaut (pas d’étape « rejoindre »)
        if (!isPharmacy[pharmacy]) {
            isPharmacy[pharmacy] = true;
            emit PharmacyJoined(pharmacy);
        }

        shareId = nextShareId++;
        shares[shareId] = PrescriptionShare(
            msg.sender,
            pharmacy,
            docHash,
            memo,
            uint64(block.timestamp),
            Status.Shared
        );
        emit PrescriptionShared(shareId, msg.sender, pharmacy, docHash, memo);
    }

    function dispense(uint256 shareId) external {
        PrescriptionShare storage s = shares[shareId];
        require(s.status == Status.Shared, "status");
        require(msg.sender == s.pharmacy, "party");
        if (!isPharmacy[msg.sender]) {
            isPharmacy[msg.sender] = true;
            emit PharmacyJoined(msg.sender);
        }
        s.status = Status.Dispensed;
        emit PrescriptionDispensed(shareId, msg.sender, s.patient);
    }
}
