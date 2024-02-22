const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");
const { assert, expect } = require("chai");
const chai = require("chai");
const eventemitter2 = require("chai-eventemitter2");

chai.use(eventemitter2());

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Unit Tests", async () => {
      let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        raffle = await ethers.getContract("Raffle", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        raffleEntranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe("constructor", async () => {
        it("Initialize the raffle correctly", async () => {
          const raffleState = await raffle.getRaffleState();
          assert(raffleState.toString(), "0");
          assert(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("enterRaffle", async () => {
        it("reverts when not enough payment", async () => {
          try {
            await raffle.enterRaffle();
            // If the function did not revert as expected, fail the test
            assert.fail("Transaction did not revert as expected");
          } catch (error) {
            // Check if the error message indicates a revert
            assert(
              error.message.includes("revert"),
              `Expected "revert", got ${error}`
            );
          }
        });

        it("records players when they enter", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          const playerFromContract = await raffle.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });

        it("emits event on enter", async () => {
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.emit(raffle, "RaffleEnter");
        });

        it("doesn't allow entrance when raffle is calculating", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          // we pretend to be a keeper for a second
          await raffle.performUpkeep("0x"); // changes the state to calculating for our comparison below
          try {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            assert.fail("Entrance should have reverted");
          } catch (error) {
            assert(
              error.message.includes("revert"),
              `Expected "revert", got ${error}`
            );
          }
        });
      });
    });
