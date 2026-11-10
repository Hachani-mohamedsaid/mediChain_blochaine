// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IMediChainPatients} from "./Interfaces.sol";

/// Preuve d’accès soulbound chez le MÉDECIN (pas le patient)
contract AccessGrantNFT is ERC721 {
    IMediChainPatients public immutable mediChain;
    uint256 public nextTokenId = 1;

    mapping(uint256 => bytes32) public docHashOf;
    mapping(uint256 => uint256) public chainGrantIdOf;
    mapping(uint256 => address) public patientOf;
    mapping(uint256 => uint64) public expiresAtOf;
    mapping(uint256 => string) private _tokenURIs;
    /// chainGrantId → access NFT tokenId
    mapping(uint256 => uint256) public tokenOfGrant;

    event AccessNftMinted(
        uint256 indexed tokenId,
        address indexed doctor,
        address indexed patient,
        uint256 chainGrantId,
        bytes32 docHash
    );

    constructor(address mediChain_) ERC721("MediChain Access", "MCA") {
        mediChain = IMediChainPatients(mediChain_);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "URI");
        return _tokenURIs[tokenId];
    }

    /// Patient mint l’accès → NFT chez le médecin
    function mintToDoctor(
        address doctor,
        bytes32 docHash,
        uint256 chainGrantId,
        uint64 expiresAt,
        string calldata uri
    ) external returns (uint256 tokenId) {
        require(mediChain.isPatient(msg.sender), "not patient");
        require(doctor != address(0) && docHash != bytes32(0), "bad args");
        require(expiresAt > block.timestamp, "expired");
        require(tokenOfGrant[chainGrantId] == 0, "already");

        tokenId = nextTokenId++;
        docHashOf[tokenId] = docHash;
        chainGrantIdOf[tokenId] = chainGrantId;
        patientOf[tokenId] = msg.sender;
        expiresAtOf[tokenId] = expiresAt;
        tokenOfGrant[chainGrantId] = tokenId;
        _mint(doctor, tokenId);
        _tokenURIs[tokenId] = uri;
        emit AccessNftMinted(tokenId, doctor, msg.sender, chainGrantId, docHash);
    }

    function _beforeTokenTransfer(address from, address to, uint256 id, uint256 n) internal override {
        require(from == address(0) || to == address(0), "soulbound");
        super._beforeTokenTransfer(from, to, id, n);
    }
}
