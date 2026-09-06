// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Append-only commitments, not a claim of identity or search-provider truth.
contract VerificationRegistry {
    struct Record {
        bytes32 storageRootHash;
        bytes32 photoCommitment;
        bytes32 matchedUrlCommitment;
        address submitter;
        uint64 timestamp;
    }

    uint256 public nextId;
    mapping(uint256 => Record) public records;

    event RecordCreated(
        uint256 indexed id,
        bytes32 indexed storageRootHash,
        bytes32 photoCommitment,
        bytes32 matchedUrlCommitment,
        address indexed submitter,
        uint64 timestamp
    );

    function submitRecord(bytes32 storageRootHash, bytes32 photoCommitment, bytes32 matchedUrlCommitment)
        external returns (uint256 id)
    {
        require(storageRootHash != bytes32(0), "empty storage root");
        require(photoCommitment != bytes32(0), "empty photo commitment");
        require(matchedUrlCommitment != bytes32(0), "empty URL commitment");
        id = nextId++;
        uint64 timestamp = uint64(block.timestamp);
        records[id] = Record(storageRootHash, photoCommitment, matchedUrlCommitment, msg.sender, timestamp);
        emit RecordCreated(id, storageRootHash, photoCommitment, matchedUrlCommitment, msg.sender, timestamp);
    }

    function getRecord(uint256 id) external view returns (Record memory) {
        require(id < nextId, "record does not exist");
        return records[id];
    }
}
