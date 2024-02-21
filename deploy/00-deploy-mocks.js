const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.parseUnits("0.25", 18);
const GAS_PRICE_LINK = 1e9;

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const agrs = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    log("Local network detected! Deploying mocks...");

    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      args: agrs,
      log: true,
    });
    log("Mocks Deployed!");
    log("__________________________________________");
  }
};

module.exports.tags = ["all", "mocks"];
