const { ethers, network } = require("hardhat")
const fs = require("fs")
require("dotenv").config()

const FRONTEND_ADDRESSES_FILE = "../5-nextjs-hardhat/constants/contractAddresses.json"
const FRONTEND_ABI_FILE = "../5-nextjs-hardhat/constants/abi.json"

async function updateFrontend() {
    if (process.env.UPDATE_FRONTEND) {
        console.log("Updating frontend....")
        await updateContractAddresses()
        await updateAbi()
        console.log("----------------------------------------------------")
    }
}

async function updateContractAddresses() {
    console.log("Update contract addresses")
    const raffle = await ethers.getContract("Raffle")
    const chainId = network.config.chainId.toString()
    const raffleAddress = await raffle.getAddress()

    console.log(`chain id ${chainId}, address ${raffleAddress}`)

    const file = fs.readFileSync(FRONTEND_ADDRESSES_FILE, "utf8")
    const currentAddresses = JSON.parse(file)

    if (chainId in currentAddresses) {
        if (!currentAddresses[chainId].includes(raffleAddress)) {
            currentAddresses[chainId] = [raffleAddress]
        }
    } else {
        currentAddresses[chainId] = [raffleAddress]
    }
    fs.writeFileSync(FRONTEND_ADDRESSES_FILE, JSON.stringify(currentAddresses))
}

async function updateAbi() {
    console.log("Update abi")
    const raffle = await ethers.getContract("Raffle")
    const abi = raffle.interface.formatJson()
    fs.writeFileSync(FRONTEND_ABI_FILE, abi)
}

module.exports = updateFrontend
