const { ethers, network } = require("hardhat");
const fs = require("fs");

const FRONT_END_ADDRESSES_FILE =
  "../nextjs-lottery/src/app/constants/contractAddresses.json";
const FRONT_END_ABI_FILE = "../nextjs-lottery/src/app/constants/abi.json";

module.exports = async () => {
  if (process.env.UPDATE_FRONT_END) {
    console.log("Updating front end...");
    await updateContractAddresses();
    await updateAbi();
  }
};

async function updateAbi() {
  const raffle = await ethers.getContract("Raffle");
  const abiArray = raffle.interface.fragments;
  fs.writeFileSync(FRONT_END_ABI_FILE, JSON.stringify(abiArray));
  console.log("Updating ABI in front end...");
}

async function updateContractAddresses() {
  const raffle = await ethers.getContract("Raffle");
  const currentAddress = JSON.parse(
    fs.readFileSync(FRONT_END_ADDRESSES_FILE),
    "utf-8"
  );
  const chainId = network.config.chainId.toString();
  if (chainId in currentAddress) {
    if (!currentAddress[chainId].includes(raffle.target)) {
      currentAddress[chainId].push(raffle.target);
    }
  } else {
    currentAddress[chainId] = [raffle.target];
  }
  fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddress));
  console.log("Updating contract addresses in front end...");
}

module.exports.tags = ["all", "frontend"];
