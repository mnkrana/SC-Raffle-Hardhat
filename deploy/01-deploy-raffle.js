const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains, VERIFICATION_BLOCK_CONFIRMATIONS } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

const FUND_AMOUNT = ethers.parseEther("1.0") // 1 Ether, or 1e18 (10^18) Wei

async function deployRaffle({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock

    if (chainId == 31337) {
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = await vrfCoordinatorV2Mock.getAddress()
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait()
        subscriptionId = transactionReceipt.logs[0].args.subId
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const waitBlockConfirmations = developmentChains.includes(network.name) ? 0 : VERIFICATION_BLOCK_CONFIRMATIONS
    const raffleArgs = [
        vrfCoordinatorV2Address,
        subscriptionId,
        networkConfig[chainId]["gasLane"],
        networkConfig[chainId]["keepersUpdateInterval"],
        networkConfig[chainId]["raffleEntranceFee"],
        networkConfig[chainId]["callbackGasLimit"],
    ]

    log("----------------------------------------------------")
    log("Deploying Raffle and waiting for confirmations...")
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: raffleArgs,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })
    log(`Raffle deployed at ${raffle.address}`)

    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, raffleArgs)
    }

    log("Enter lottery with command:")
    const networkName = network.name == "hardhat" ? "localhost" : network.name
    log(`yarn hardhat run scripts/enter.js --network ${networkName}`)
    log("----------------------------------------------------")
}

module.exports.default = deployRaffle
module.exports.tags = ["all", "raffle"]
