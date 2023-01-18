//This is a test we gonna run on an actual testnet.

const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name) ? describe.skip
    :describe("Raffle Unit Test", function(){

        let raffle, raffleEntranceFee, deployer

        beforeEach(async function() {
            deployer = (await getNamedAccounts()).deployer
            raffle = await ethers.getContract("Raffle", deployer)
            raffleEntranceFee = await raffle.getEntranceFee()
        })

        describe("fulfilRandomWords", function(){
            it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function(){
                console.log("Setting up test...")

                const startingTimeStamp = await raffle.getLatestTimeStamp()
                const accounts = await ethers.getSigners()

                console.log("Setting up Listener...")
                await new Promise(async (resolve, reject) => {

                    raffle.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event fired!")

                        try{
                        
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const winnerEndinggBalance = await accounts[0].getBalance()
                            const endingTimeStamp = await raffle.getLatestTimeStamp()

                            //asserts
                            await expect(raffle.getPlayer(0)).to.be.reverted
                            assert.equal(recentWinner.toString(), accounts[0].address)
                            assert.equal(raffleState.toString(), "0")
                            assert.equal(winnerEndinggBalance.toString(), winnerStartingBalance.add(raffleEntranceFee).toString())
                            assert(endingTimeStamp > startingTimeStamp)
    
                            resolve()
                        } catch(error){
                            console.log(error)
                            reject(error)
                        }

                    })

                    //Then entering the raffle
                    console.log("Entering Raffle...")
                    const tx = await raffle.enterRaffle({value: raffleEntranceFee})
                    await tx.wait(1)

                    console.log("Ok, time to wait...")
                    const winnerStartingBalance = await ethers.accounts[0].getBalance()


                })

            })
        })
    })