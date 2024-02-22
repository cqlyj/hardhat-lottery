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

      describe("checkUpKeep", async () => {
        it("returns false if people haven't sent any ETH", async () => {
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upKeepNeeded } = await raffle.checkUpkeep("0x");
          assert(!upKeepNeeded);
        });

        it("returns false if raffle isn't open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          // we pretend to be a keeper for a second
          await raffle.performUpkeep("0x");
          const raffleState = await raffle.getRaffleState();
          const { upKeepNeeded } = await raffle.checkUpkeep("0x");
          assert(raffleState.toString(), "1");
          assert(!upKeepNeeded);
        });

        it("returns false if enough time hasn't passed", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) - 5,
          ]); // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(!upkeepNeeded);
        });

        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded);
        });
      });

      describe("performUpkeep", async () => {
        it("it can only run if checkUpkeep is true", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const tx = await raffle.performUpkeep("0x");
          assert(tx);
        });

        it("reverts if checkup is false", async () => {
          try {
            await raffle.performUpkeep("0x");
            assert.fail("Expected performUpkeep to revert");
          } catch (error) {
            assert(
              error.message.includes("Raffle__UpkeepNotNeeded"),
              `Expected revert reason Raffle__UpkeepNotNeeded, got ${error}`
            );
          }
        });

        it("updates the raffle state and emits a requestId", async () => {
          // Too many asserts in this test!
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const txResponse = await raffle.performUpkeep("0x"); // emits requestId
          const txReceipt = await txResponse.wait(1); // waits 1 block
          const raffleState = await raffle.getRaffleState(); // updates state
          const requestId = txReceipt.logs[1].args.requestId;
          assert(Number(requestId) > 0);
          assert(raffleState == 1); // 0 = open, 1 = calculating
        });
      });

      describe("fulfillRandomWords", async () => {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            Number(interval) + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
        });

        it("can only be called after performupkeep", async () => {
          try {
            await vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target); // reverts if not fulfilled
            assert.fail("Expected revert not received");
          } catch (error) {
            assert(
              error.message.includes("nonexistent request"),
              "Expected revert message not received"
            );
          }

          try {
            await vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target); // reverts if not fulfilled
            assert.fail("Expected revert not received");
          } catch (error) {
            assert(
              error.message.includes("nonexistent request"),
              "Expected revert message not received"
            );
          }
        });

        // it("picks a winner, resets, and sends money", async () => {
        //   const additionalEntrances = 3; // to test
        //   const startingIndex = 2;
        //   const accounts = await ethers.getSigners();
        //   let startingBalance;
        //   for (
        //     let i = startingIndex;
        //     i < startingIndex + additionalEntrances;
        //     i++
        //   ) {
        //     const accountConnectedRaffle = raffle.connect(accounts[i]); // Returns a new instance of the Raffle contract connected to player
        //     await accountConnectedRaffle.enterRaffle({
        //       value: raffleEntranceFee,
        //     });
        //   }
        //   const startingTimeStamp = await raffle.getLastTimeStamp(); // stores starting timestamp (before we fire our event)

        //   await new Promise(async (resolve, reject) => {
        //     raffle.once("WinnerPicked", async () => {
        //       // event listener for WinnerPicked
        //       console.log("WinnerPicked event fired!");
        //       // assert throws an error if it fails, so we need to wrap
        //       // it in a try/catch so that the promise returns event
        //       // if it fails.
        //       try {
        //         // Now lets get the ending values...
        //         const recentWinner = await raffle.getRecentWinner();
        //         const raffleState = await raffle.getRaffleState();
        //         const winnerBalance = await ethers.provider.getBalance(
        //           accounts[2]
        //         );
        //         const endingTimeStamp = await raffle.getLastTimeStamp();
        //         // Comparisons to check if our ending values are correct:
        //         try {
        //           await raffle.getPlayer(0);
        //           assert.fail("Transaction did not revert");
        //         } catch (error) {
        //           assert.include(
        //             error.message,
        //             "revert",
        //             "Transaction should revert"
        //           );
        //         }
        //         assert.equal(recentWinner.toString(), accounts[2].address);
        //         assert.equal(raffleState, 0);
        //         assert.equal(
        //           winnerBalance.toString(),
        //           startingBalance + // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
        //             (
        //               raffleEntranceFee * BigInt(additionalEntrances) +
        //               raffleEntranceFee
        //             ).toString()
        //         );
        //         assert(endingTimeStamp > startingTimeStamp);
        //         resolve(); // if try passes, resolves the promise
        //       } catch (e) {
        //         reject(e); // if try fails, rejects the promise
        //       }
        //     });

        //     // kicking off the event by mocking the chainlink keepers and vrf coordinator
        //     try {
        //       const tx = await raffle.performUpkeep("0x");
        //       const txReceipt = await tx.wait(1);
        //       startingBalance = await ethers.provider.getBalance(accounts[2]);
        //       await vrfCoordinatorV2Mock.fulfillRandomWords(
        //         txReceipt.logs[1].args.requestId,
        //         raffle.target
        //       );
        //     } catch (e) {
        //       reject(e);
        //     }
        //   });
        // });
      });
    });
