// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Commande stock pharmacie → fournisseur (on-chain)
/// Pharmacie et fournisseur sont liés par l’ordre (adresses) — pas de registre à rejoindre.
contract MediChainSupply {
    address public immutable admin;
    uint256 public nextOrderId = 1;

    /// Conservés pour compat UI / lecture ; plus d’obligation de join
    mapping(address => bool) public isPharmacy;
    mapping(address => bool) public isSupplier;

    enum Status {
        None,
        Requested,
        Fulfilled,
        Cancelled
    }

    struct SupplyOrder {
        address pharmacy;
        address supplier;
        string medicineId;
        string medicineName;
        uint32 quantity;
        string memo;
        uint64 requestedAt;
        Status status;
    }

    mapping(uint256 => SupplyOrder) public orders;

    /// Getter sûr (évite StackOverflow Hardhat sur le getter auto des strings)
    function getOrder(
        uint256 orderId
    )
        external
        view
        returns (
            address pharmacy,
            address supplier,
            string memory medicineId,
            string memory medicineName,
            uint32 quantity,
            string memory memo,
            uint64 requestedAt,
            Status status
        )
    {
        SupplyOrder storage o = orders[orderId];
        return (
            o.pharmacy,
            o.supplier,
            o.medicineId,
            o.medicineName,
            o.quantity,
            o.memo,
            o.requestedAt,
            o.status
        );
    }

    event PharmacyJoined(address indexed pharmacy);
    event SupplierJoined(address indexed supplier);
    event SupplyRequested(
        uint256 indexed orderId,
        address indexed pharmacy,
        address indexed supplier,
        string medicineId,
        uint32 quantity
    );
    event SupplyFulfilled(
        uint256 indexed orderId,
        address indexed supplier,
        address indexed pharmacy
    );
    event SupplyCancelled(uint256 indexed orderId, address indexed by);

    constructor() {
        admin = msg.sender;
    }

    function joinAsPharmacy() external {
        if (isPharmacy[msg.sender]) return;
        isPharmacy[msg.sender] = true;
        emit PharmacyJoined(msg.sender);
    }

    function joinAsSupplier() external {
        if (isSupplier[msg.sender]) return;
        isSupplier[msg.sender] = true;
        emit SupplierJoined(msg.sender);
    }

    /// Admin : lie pharmacie + fournisseur sans MetaMask (seed local)
    function adminLink(address pharmacy, address supplier) external {
        require(msg.sender == admin, "admin");
        if (pharmacy != address(0) && !isPharmacy[pharmacy]) {
            isPharmacy[pharmacy] = true;
            emit PharmacyJoined(pharmacy);
        }
        if (supplier != address(0) && !isSupplier[supplier]) {
            isSupplier[supplier] = true;
            emit SupplierJoined(supplier);
        }
    }

    /// Pharmacie : « apporte-moi ce médicament »
    function requestSupply(
        address supplier,
        string calldata medicineId,
        string calldata medicineName,
        uint32 quantity,
        string calldata memo
    ) external returns (uint256 orderId) {
        require(supplier != address(0) && supplier != msg.sender, "bad supplier");
        require(quantity > 0, "qty");
        require(bytes(medicineId).length > 0, "med");

        // Marque les deux parties liées dès la commande
        if (!isPharmacy[msg.sender]) {
            isPharmacy[msg.sender] = true;
            emit PharmacyJoined(msg.sender);
        }
        if (!isSupplier[supplier]) {
            isSupplier[supplier] = true;
            emit SupplierJoined(supplier);
        }

        orderId = nextOrderId++;
        orders[orderId] = SupplyOrder({
            pharmacy: msg.sender,
            supplier: supplier,
            medicineId: medicineId,
            medicineName: medicineName,
            quantity: quantity,
            memo: memo,
            requestedAt: uint64(block.timestamp),
            status: Status.Requested
        });
        emit SupplyRequested(
            orderId,
            msg.sender,
            supplier,
            medicineId,
            quantity
        );
    }

    /// Fournisseur : livre la commande
    function fulfillSupply(uint256 orderId) external {
        SupplyOrder storage o = orders[orderId];
        require(o.status == Status.Requested, "status");
        require(msg.sender == o.supplier, "party");
        o.status = Status.Fulfilled;
        emit SupplyFulfilled(orderId, msg.sender, o.pharmacy);
    }

    function cancelSupply(uint256 orderId) external {
        SupplyOrder storage o = orders[orderId];
        require(o.status == Status.Requested, "status");
        require(
            msg.sender == o.pharmacy || msg.sender == o.supplier,
            "party"
        );
        o.status = Status.Cancelled;
        emit SupplyCancelled(orderId, msg.sender);
    }
}
