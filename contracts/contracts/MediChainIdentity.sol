// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Empreinte WebAuthn → hash on-chain (jamais l'empreinte brute)
contract MediChainIdentity {
    struct Identity {
        bytes32 credentialHash;
        uint64 boundAt;
        uint64 lastVerifiedAt;
        bool active;
    }

    mapping(address => Identity) public identities;
    mapping(bytes32 => address) public walletOfCredential;

    event BiometricBound(address indexed wallet, bytes32 indexed credentialHash, uint64 boundAt);
    event BiometricRotated(address indexed wallet, bytes32 indexed oldHash, bytes32 indexed newHash);
    event BiometricVerified(address indexed wallet, uint64 verifiedAt);
    event BiometricRevoked(address indexed wallet, bytes32 indexed credentialHash);

    function bindBiometric(bytes32 credentialHash) external {
        require(credentialHash != bytes32(0), "zero");
        Identity storage id = identities[msg.sender];
        require(!id.active, "bound");
        require(walletOfCredential[credentialHash] == address(0), "taken");
        _set(id, credentialHash);
        emit BiometricBound(msg.sender, credentialHash, id.boundAt);
    }

    function rotateBiometric(bytes32 newHash) external {
        require(newHash != bytes32(0), "zero");
        Identity storage id = identities[msg.sender];
        require(id.active, "unbound");
        require(walletOfCredential[newHash] == address(0), "taken");
        bytes32 old = id.credentialHash;
        delete walletOfCredential[old];
        _set(id, newHash);
        emit BiometricRotated(msg.sender, old, newHash);
    }

    function attestVerification() external {
        Identity storage id = identities[msg.sender];
        require(id.active, "unbound");
        id.lastVerifiedAt = uint64(block.timestamp);
        emit BiometricVerified(msg.sender, id.lastVerifiedAt);
    }

    function revokeBiometric() external {
        Identity storage id = identities[msg.sender];
        require(id.active, "unbound");
        bytes32 hash = id.credentialHash;
        delete walletOfCredential[hash];
        delete identities[msg.sender];
        emit BiometricRevoked(msg.sender, hash);
    }

    function isBound(address wallet) external view returns (bool) {
        return identities[wallet].active;
    }

    function credentialHashOf(address wallet) external view returns (bytes32) {
        return identities[wallet].credentialHash;
    }

    function getIdentity(address wallet)
        external
        view
        returns (bytes32 credentialHash, uint64 boundAt, uint64 lastVerifiedAt, bool active)
    {
        Identity storage id = identities[wallet];
        return (id.credentialHash, id.boundAt, id.lastVerifiedAt, id.active);
    }

    function _set(Identity storage id, bytes32 hash) private {
        id.credentialHash = hash;
        id.boundAt = uint64(block.timestamp);
        id.lastVerifiedAt = uint64(block.timestamp);
        id.active = true;
        walletOfCredential[hash] = msg.sender;
    }
}
