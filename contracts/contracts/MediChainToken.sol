// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IMediChainPatients} from "./Interfaces.sol";

interface IMediChainPayView {
    function payments(uint256 paymentId)
        external
        view
        returns (
            address patient,
            address doctor,
            uint256 amountWei,
            bytes32 docHash,
            string memory memo,
            uint64 paidAt,
            uint64 refundAfter,
            uint8 status
        );
}

/// Token utilitaire MCT : acheter avec ETH, bonus réservation, payer le médicament
contract MediChainToken is ERC20 {
    IMediChainPatients public immutable mediChain;
    IMediChainPayView public payContract;
    address public immutable admin;

    /// 1000 MCT pour 1 ETH
    uint256 public tokensPerEth = 1000 ether;
    /// Bonus MCT après réservation / paiement consultation
    uint256 public reservationBonus = 50 ether;
    /// Prix médicament par défaut (pharmacie peut accepter un montant custom)
    uint256 public defaultMedicinePrice = 25 ether;

    mapping(address => bool) public isPharmacy;
    mapping(uint256 => bool) public reservationClaimed;

    event TokensBought(address indexed buyer, uint256 ethIn, uint256 tokensOut);
    event ReservationBonusClaimed(
        uint256 indexed paymentId,
        address indexed patient,
        uint256 amount
    );
    event MedicinePaid(
        address indexed patient,
        address indexed pharmacy,
        uint256 amount,
        uint256 indexed shareId
    );
    event PharmacySet(address indexed pharmacy, bool allowed);
    event PayContractSet(address indexed pay);

    constructor(address mediChain_) ERC20("MediChain Token", "MCT") {
        admin = msg.sender;
        mediChain = IMediChainPatients(mediChain_);
    }

    function setPayContract(address pay_) external {
        require(msg.sender == admin, "admin");
        payContract = IMediChainPayView(pay_);
        emit PayContractSet(pay_);
    }

    function setPharmacy(address pharmacy, bool allowed) external {
        require(msg.sender == admin || msg.sender == pharmacy, "auth");
        if (msg.sender == pharmacy) {
            require(allowed, "self-on only");
            isPharmacy[pharmacy] = true;
        } else {
            isPharmacy[pharmacy] = allowed;
        }
        emit PharmacySet(pharmacy, allowed);
    }

    function joinAsPharmacy() external {
        isPharmacy[msg.sender] = true;
        emit PharmacySet(msg.sender, true);
    }

    function setRates(
        uint256 tokensPerEth_,
        uint256 reservationBonus_,
        uint256 defaultMedicinePrice_
    ) external {
        require(msg.sender == admin, "admin");
        tokensPerEth = tokensPerEth_;
        reservationBonus = reservationBonus_;
        defaultMedicinePrice = defaultMedicinePrice_;
    }

    /// Échanger des ETH contre des MCT
    function buyWithEth() external payable returns (uint256 tokensOut) {
        require(msg.value > 0, "no eth");
        tokensOut = (msg.value * tokensPerEth) / 1 ether;
        require(tokensOut > 0, "dust");
        _mint(msg.sender, tokensOut);
        emit TokensBought(msg.sender, msg.value, tokensOut);
    }

    /// Après réservation MediChainPay : claim bonus MCT (1× par paymentId)
    function claimReservationBonus(uint256 paymentId) external returns (uint256) {
        require(address(payContract) != address(0), "no pay");
        require(!reservationClaimed[paymentId], "claimed");
        require(mediChain.isPatient(msg.sender), "not patient");

        (
            address patient,
            ,
            ,
            ,
            ,
            ,
            ,
            uint8 status
        ) = payContract.payments(paymentId);
        require(patient == msg.sender, "not yours");
        // Locked=1, Released=2
        require(status == 1 || status == 2, "bad status");

        reservationClaimed[paymentId] = true;
        _mint(msg.sender, reservationBonus);
        emit ReservationBonusClaimed(paymentId, msg.sender, reservationBonus);
        return reservationBonus;
    }

    /// Payer le médicament à la pharmacie en MCT (lié optionnellement à un shareId)
    function payForMedicine(
        address pharmacy,
        uint256 amount,
        uint256 shareId
    ) external {
        require(pharmacy != address(0), "bad pharmacy");
        require(mediChain.isPatient(msg.sender), "not patient");
        // Pharmacie inscrite automatiquement — plus de registre à rejoindre
        if (!isPharmacy[pharmacy]) {
            isPharmacy[pharmacy] = true;
            emit PharmacySet(pharmacy, true);
        }
        uint256 payAmount = amount == 0 ? defaultMedicinePrice : amount;
        require(payAmount > 0, "amount");
        _transfer(msg.sender, pharmacy, payAmount);
        emit MedicinePaid(msg.sender, pharmacy, payAmount, shareId);
    }

    function withdrawEth(address to) external {
        require(msg.sender == admin, "admin");
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "eth");
    }
}
