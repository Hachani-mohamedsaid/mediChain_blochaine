// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IMediChainPatients, IMediChainDoctors} from "./Interfaces.sol";

/// Attestation soulbound d'un dossier (hash only) — URI sans ERC721URIStorage
contract MedicalRecordNFT is ERC721 {
    IMediChainPatients public immutable mediChain;
    IMediChainDoctors public immutable doctorRegistry;
    uint256 public nextTokenId = 1;
    mapping(bytes32 => uint256) public tokenOfHash;
    mapping(uint256 => bytes32) public hashOfToken;
    mapping(uint256 => string) private _tokenURIs;

    event RecordMinted(
        uint256 indexed tokenId,
        address indexed patient,
        bytes32 indexed docHash,
        string tokenURI_
    );

    constructor(address mediChain_, address doctorRegistry_)
        ERC721("MediChain Record", "MCR")
    {
        mediChain = IMediChainPatients(mediChain_);
        doctorRegistry = IMediChainDoctors(doctorRegistry_);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "URI");
        return _tokenURIs[tokenId];
    }

    /// Patient ancre son propre document
    function mint(bytes32 docHash, string calldata uri) external returns (uint256 tokenId) {
        require(mediChain.isPatient(msg.sender), "not patient");
        tokenId = _mintTo(msg.sender, docHash, uri);
    }

    /// Médecin ajoute au dossier patient → NFT soulbound chez le patient
    function mintForPatient(
        address patient,
        bytes32 docHash,
        string calldata uri
    ) external returns (uint256 tokenId) {
        require(doctorRegistry.isDoctor(msg.sender), "not doctor");
        require(mediChain.isPatient(patient) && patient != address(0), "not patient");
        tokenId = _mintTo(patient, docHash, uri);
    }

    function _mintTo(
        address patient,
        bytes32 docHash,
        string calldata uri
    ) private returns (uint256 tokenId) {
        require(docHash != bytes32(0) && tokenOfHash[docHash] == 0, "bad/minted");
        tokenId = nextTokenId++;
        tokenOfHash[docHash] = tokenId;
        hashOfToken[tokenId] = docHash;
        _mint(patient, tokenId);
        _tokenURIs[tokenId] = uri;
        emit RecordMinted(tokenId, patient, docHash, uri);
    }

    function _beforeTokenTransfer(address from, address to, uint256 id, uint256 n) internal override {
        require(from == address(0) || to == address(0), "soulbound");
        super._beforeTokenTransfer(from, to, id, n);
    }
}
