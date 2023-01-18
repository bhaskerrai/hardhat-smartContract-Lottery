const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify.js")


const FUND_AMOUNT = ethers.utils.parseEther("2")

module.exports = async function({ getNamedAccounts, deployments }) {
    const {deploy, log} = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    
    let vrfCoordinatorV2Address, subscriptionId

    if(developmentChains.includes(network.name)){
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") //Returns a new connection to a contract at contractAddressOrName with the contractInterface.
        vrfCoordinatorV2Address = (await vrfCoordinatorV2Mock).address //check it

        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)

        subscriptionId = transactionReceipt.events[0].args.subId

        //Funding the subscription
        //Usually, you'd need the link token on a real network

        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT)
    }

    else{
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]


    const args = [vrfCoordinatorV2Address, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval]

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmation || 1
    })

    // if(!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY){
    //     log("Verifying...")
    //     await verify(raffle.address, args)
    // }

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, args)
    }


    log("------------------------------------------------------")
}

module.exports.tags = ["all", "raffle"]