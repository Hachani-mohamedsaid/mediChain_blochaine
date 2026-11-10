// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IMediChainPatients, IMediChainDoctors} from "./Interfaces.sol";

/// Escrow consultation + litige / arbitrage admin
contract MediChainPay {
    IMediChainPatients public immutable mediChain;
    IMediChainDoctors public immutable doctorRegistry;
    address public immutable admin;
    uint256 public nextPaymentId = 1;
    uint64 public defaultRefundAfter = 7 days;
    mapping(address => uint256) public consultationFeeWei;

    enum Status { None, Locked, Released, Refunded, Disputed }

    struct Payment {
        address patient;
        address doctor;
        uint256 amountWei;
        bytes32 docHash;
        string memo;
        uint64 paidAt;
        uint64 refundAfter;
        Status status;
    }
    mapping(uint256 => Payment) public payments;
    mapping(bytes32 => uint256) public lockedPaymentByKey;

    event FeeSet(address indexed doctor, uint256 feeWei);
    event ConsultationPaid(uint256 indexed paymentId, address indexed patient, address indexed doctor, uint256 amountWei, bytes32 docHash);
    event PaymentReleased(uint256 indexed paymentId, address indexed doctor, uint256 amountWei);
    event PaymentRefunded(uint256 indexed paymentId, address indexed patient, uint256 amountWei);
    event DisputeRaised(uint256 indexed paymentId, address indexed by, string reason);
    event DisputeResolved(uint256 indexed paymentId, uint256 doctorShareWei, uint256 patientShareWei);

    constructor(address mediChain_, address doctorRegistry_) {
        admin = msg.sender;
        mediChain = IMediChainPatients(mediChain_);
        doctorRegistry = IMediChainDoctors(doctorRegistry_);
    }

    function setConsultationFee(uint256 feeWei) external {
        require(doctorRegistry.isDoctor(msg.sender), "not doctor");
        consultationFeeWei[msg.sender] = feeWei;
        emit FeeSet(msg.sender, feeWei);
    }

    function payConsultation(address doctor, bytes32 docHash, string calldata memo)
        external
        payable
        returns (uint256 paymentId)
    {
        require(mediChain.isPatient(msg.sender), "not patient");
        require(doctorRegistry.isDoctor(doctor) && doctor != address(0), "bad doctor");
        uint256 fee = consultationFeeWei[doctor];
        require(fee == 0 ? msg.value > 0 : msg.value >= fee, "bad fee");

        paymentId = nextPaymentId++;
        payments[paymentId] = Payment(
            msg.sender, doctor, msg.value, docHash, memo,
            uint64(block.timestamp), uint64(block.timestamp) + defaultRefundAfter, Status.Locked
        );
        lockedPaymentByKey[_key(doctor, docHash)] = paymentId;
        emit ConsultationPaid(paymentId, msg.sender, doctor, msg.value, docHash);
    }

    function releasePayment(uint256 paymentId) external {
        Payment storage p = _locked(paymentId);
        require(msg.sender == p.doctor, "party");
        _release(paymentId, p);
    }

    function releaseByDocHash(bytes32 docHash) external returns (uint256 paymentId) {
        paymentId = lockedPaymentByKey[_key(msg.sender, docHash)];
        require(paymentId != 0, "none");
        Payment storage p = _locked(paymentId);
        require(msg.sender == p.doctor, "party");
        _release(paymentId, p);
    }

    function confirmAndRelease(uint256 paymentId) external {
        Payment storage p = _locked(paymentId);
        require(msg.sender == p.patient, "party");
        _release(paymentId, p);
    }

    function refundPayment(uint256 paymentId) external {
        Payment storage p = _locked(paymentId);
        require(msg.sender == p.patient && block.timestamp >= p.refundAfter, "early/party");
        p.status = Status.Refunded;
        _clearKey(p, paymentId);
        _send(p.patient, p.amountWei);
        emit PaymentRefunded(paymentId, p.patient, p.amountWei);
    }

    function raiseDispute(uint256 paymentId, string calldata reason) external {
        Payment storage p = _locked(paymentId);
        require(msg.sender == p.patient || msg.sender == p.doctor, "party");
        p.status = Status.Disputed;
        _clearKey(p, paymentId);
        emit DisputeRaised(paymentId, msg.sender, reason);
    }

    function resolveDispute(uint256 paymentId, uint256 doctorBps) external {
        require(msg.sender == admin && doctorBps <= 10_000, "admin/bps");
        Payment storage p = payments[paymentId];
        require(p.status == Status.Disputed, "status");
        uint256 dShare = (p.amountWei * doctorBps) / 10_000;
        uint256 pShare = p.amountWei - dShare;
        p.status = Status.Released;
        if (dShare > 0) _send(p.doctor, dShare);
        if (pShare > 0) _send(p.patient, pShare);
        emit DisputeResolved(paymentId, dShare, pShare);
        if (dShare > 0) emit PaymentReleased(paymentId, p.doctor, dShare);
        if (pShare > 0) emit PaymentRefunded(paymentId, p.patient, pShare);
    }

    function _key(address doctor, bytes32 docHash) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(doctor, docHash));
    }

    function _locked(uint256 paymentId) private view returns (Payment storage p) {
        p = payments[paymentId];
        require(p.status == Status.Locked, "status");
    }

    function _clearKey(Payment storage p, uint256 paymentId) private {
        bytes32 k = _key(p.doctor, p.docHash);
        if (lockedPaymentByKey[k] == paymentId) delete lockedPaymentByKey[k];
    }

    function _release(uint256 paymentId, Payment storage p) private {
        p.status = Status.Released;
        _clearKey(p, paymentId);
        _send(p.doctor, p.amountWei);
        emit PaymentReleased(paymentId, p.doctor, p.amountWei);
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer");
    }
}
