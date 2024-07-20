const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

const increaseIntervalBy = 40

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, raffleContract, vrfCoordinatorV2Mock, raffleEntranceFee, interval, player

          beforeEach(async () => {
              accounts = await ethers.getSigners()
              player = accounts[1]
              await deployments.fixture()
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
              raffleContract = await ethers.getContract("Raffle")
              raffle = raffleContract.connect(player)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async () => {
                  const raffleState = (await raffle.getRaffleState()).toString()
                  assert.equal(raffleState, "0")
                  assert.equal(interval.toString(), networkConfig[network.config.chainId]["keepersUpdateInterval"])
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async () => {
                  const eth = await ethers.parseEther("0.001")
                  await expect(raffle.enterRaffle({ value: eth })).to.be.reverted
              })

              it("records player when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const contractPlayer = await raffle.getPlayer(0)
                  assert.equal(player.address, contractPlayer)
              })

              it("emits event on enter", async () => {
                  expect(await raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(raffle, "RaffleEnter")
              })

              it("doesn't allow entrance when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  await raffle.performUpkeep("0x")
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.reverted
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert(!upkeepNeeded)
              })

              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert.equal(raffleState.toString() == "1", upkeepNeeded == false)
              })

              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy - 15])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert(!upkeepNeeded)
              })

              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("can only run if checkupkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })

              it("reverts if checkup is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.reverted
              })

              it("updates the raffle state and emits a requestId", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const raffleState = await raffle.getRaffleState()
                  const requestId = txReceipt.logs[1].args.requestId
                  assert(requestId > 0)
                  assert(raffleState == 1)
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [increaseIntervalBy])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })

              it("can only be called after performupkeep", async () => {
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.reverted
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be.reverted
              })

              it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances = 3
                  const startingIndex = 1
                  let startingBalance
                  console.log(`Raffle fee ${raffleEntranceFee}`)
                  const bal = await player.provider.getBalance(accounts[0])
                  console.log(`${0} Starting bal of ${accounts[0].address}, is ${bal}`)
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      const bal = await player.provider.getBalance(accounts[i])
                      console.log(`${i} Starting bal of ${accounts[i].address}, is ${bal}`)
                      raffle = raffleContract.connect(accounts[i])
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(`recent winner ${recentWinner}`)

                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await player.provider.getBalance(accounts[1])
                              console.log(`win bal ${winnerBalance}`)

                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[1].address)
                              assert.equal(raffleState, 0)
                              const currentBal = BigInt(startingBalance) + raffleEntranceFee + BigInt(additionalEntrances) * raffleEntranceFee
                              assert.equal(winnerBalance.toString(), currentBal.toString())
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              console.log(`error in promise ${e}`)
                              reject(e)
                          }
                      })

                      try {
                          const tx = await raffle.performUpkeep("0x")
                          const txReceipt = await tx.wait(1)
                          startingBalance = await player.provider.getBalance(accounts[1])
                          raffleAddress = await raffle.getAddress()
                          const lotteryWinAmount = await player.provider.getBalance(raffleAddress)
                          console.log(`Lottery amount ${lotteryWinAmount}`)
                          await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.logs[1].args.requestId, raffleAddress)
                      } catch (e) {
                          console.log(`error in promise 2 ${e}`)
                          reject(e)
                      }
                  })
              })
          })
      })
