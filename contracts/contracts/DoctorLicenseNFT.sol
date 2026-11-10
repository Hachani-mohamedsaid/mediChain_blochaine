// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// Licence médecin soulbound — mint admin only (URI stocké sans ERC721URIStorage)
contract DoctorLicenseNFT is ERC721 {
    address public immutable admin;
    uint256 public nextTokenId = 1;
    mapping(address => uint256) public licenseOf;
    mapping(uint256 => string) public specialtyOf;
    mapping(uint256 => bool) public revoked;
    mapping(uint256 => string) private _tokenURIs;

    event LicenseMinted(uint256 indexed tokenId, address indexed doctor, string specialty);
    event LicenseRevoked(uint256 indexed tokenId, address indexed doctor);

    constructor() ERC721("MediChain Doctor License", "MCDL") {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "admin");
        _;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "URI");
        return _tokenURIs[tokenId];
    }

    function mintLicense(address doctor, string calldata specialty, string calldata uri)
        external
        onlyAdmin
        returns (uint256 tokenId)
    {
        require(doctor != address(0), "bad");
        require(licenseOf[doctor] == 0 || revoked[licenseOf[doctor]], "licensed");
        tokenId = nextTokenId++;
        licenseOf[doctor] = tokenId;
        specialtyOf[tokenId] = specialty;
        revoked[tokenId] = false;
        _mint(doctor, tokenId);
        _tokenURIs[tokenId] = uri;
        emit LicenseMinted(tokenId, doctor, specialty);
    }

    function revokeLicense(address doctor) external onlyAdmin {
        uint256 tokenId = licenseOf[doctor];
        require(tokenId != 0, "none");
        revoked[tokenId] = true;
        emit LicenseRevoked(tokenId, doctor);
    }

    function hasValidLicense(address doctor) public view returns (bool) {
        uint256 id = licenseOf[doctor];
        return id != 0 && !revoked[id];
    }

    function getLicense(address doctor)
        external
        view
        returns (uint256 tokenId, string memory specialty, bool active, string memory uri)
    {
        tokenId = licenseOf[doctor];
        if (tokenId == 0) return (0, "", false, "");
        return (tokenId, specialtyOf[tokenId], !revoked[tokenId], _tokenURIs[tokenId]);
    }

    function _beforeTokenTransfer(address from, address to, uint256 id, uint256 n) internal override {
        require(from == address(0) || to == address(0), "soulbound");
        super._beforeTokenTransfer(from, to, id, n);
    }
}
