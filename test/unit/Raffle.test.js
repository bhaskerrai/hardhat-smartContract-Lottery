//This is a test we gonna run on local network.

const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) ? describe.skip
:describe("Raffle Unit Test", function(){

    let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
    const chainId = network.config.chainId

    beforeEach(async function() {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"]) //run deploy on scripts with a tag of "all"
        raffle = await ethers.getContract("Raffle", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        raffleEntranceFee = await raffle.getEntranceFee()
        interval = await raffle.getInterval()

    })

    describe("Constructor", function() {
        it("Initializes the raffle correctly", async function() {
            //Ideally we have one assert statement in a "it". But we will make exceptions here.

            const raffleState = await raffle.getRaffleState()
            assert.equal(raffleState.toString(), "0")

            assert.equal(interval.toString(), networkConfig[chainId]["interval"])
        })
    })

    describe("enterRaffle", function(){
        it("revert when you don't pay enough", async function(){
            await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughEthEntered")
        })

        it("records players when they enter", async function(){
            await raffle.enterRaffle({value: raffleEntranceFee})
            const playerFromContract = await raffle.getPlayer(0)

            assert.equal(playerFromContract, deployer)
        })

        it("emit event on enter", async function() {
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.emit(raffle, "RaffleEnter")
        })
        
        it("doesn't allow entrance when raffle is calculating", async function(){
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })

            //pretend to be a chainlink keeper
            await raffle.performUpkeep([])
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.be.revertedWith("Raffle__NotOpen")
        })
    })

    describe("checkUpkeep", function(){
        it("returns false if people haven't sent any ETH", async function(){
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1 ])
            await network.provider.send("evm_mine", [])

            const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
        })

        it("returns false if raffle isn't open", async function(){
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1 ])
            await network.provider.send("evm_mine", [])

            await raffle.performUpkeep([])
            const raffleState = await raffle.getRaffleState()
            const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([])
            assert.equal(raffleState.toString(), "1")
            assert.equal(upkeepNeeded, false)

        })

        it("returns true if enough time has passed, has players, eth and is open", async function(){
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine",[])
            const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([])
            assert(upkeepNeeded)
        })
    })

    describe("performUpkeep", function(){
        it("it only runs if checkUpkeep is true", async function(){
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])

            const tx = await raffle.performUpkeep([])
            assert(tx)
        })

        it("reverts when checkUpkeep is false", async function(){
        
            await expect(raffle.performUpkeep([])).to.be.revertedWith("Raffle__UpkeepNotNeeded")
        })

        it("updates the raffle state, calls vrf coordinator and emits an event", async function(){
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])

            const txResponse = await raffle.performUpkeep([])
            const txReceipt = await txResponse.wait(1)
            const requestId = await txReceipt.events[1].args.requestId
            const raffleState = await raffle.getRaffleState()
            
            assert(requestId.toNumber() > 0)
            assert.equal(raffleState.toString(), "1")
        })
    })

    describe("fulfillRandomWords", function() {
          beforeEach(async function(){
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
          })

        it("can only be called after performUpkeep", async function(){
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith("nonexistent request")
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be.revertedWith("nonexistent request")

        })

        it("picks a winner, resets the lottery, and sends money", async function(){
            const additionalEntrants = 3
            const startingAccountIndex = 1    //deployer = 0
            const accounts = await ethers.getSigners()

            for(let i = startingAccountIndex; i < startingAccountIndex +additionalEntrants; i++){
                const accountRaffleConnected = raffle.connect(accounts[i])
                await accountRaffleConnected.enterRaffle({value: raffleEntranceFee})
            }

            const startingTimeStamp = await raffle.getLatestTimeStamp()

            await new Promise(async (resolve, reject) => {
                raffle.once("WinnerPicked", async () => {
                    console.log("Found the event!")
                    
                    try{
                        const recentWinner = await raffle.getRecentWinner()
                        console.log("Winner is:", recentWinner)

                        console.log(accounts[0].address)
                        console.log(accounts[1].address)
                        console.log(accounts[2].address)
                        console.log(accounts[3].address)

                        const raffleState = await raffle.getRaffleState()
                        const endingTimeStamp = await raffle.getLatestTimeStamp()
                        const numPlayers = await raffle.getNumOfPlayers()

                        const winnerEndinggBalance = await accounts[1].getBalance()


                        assert.equal(numPlayers.toString(), "0")
                        assert(endingTimeStamp > startingTimeStamp)
                        assert.equal(raffleState.toString(), "0")

                        assert.equal(
                            winnerEndinggBalance.toString(), 
                            winnerStartingBalance.add
                            (raffleEntranceFee.mul(additionalEntrants).add(raffleEntranceFee).toString()
                            )
                        )


                    } catch(e){
                        reject(e)
                    }

                    resolve()
                })

                const tx = await raffle.performUpkeep([])
                const txReceipt = await tx.wait(1)
                const winnerStartingBalance = await accounts[1].getBalance()
                await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, raffle.address)


                
            })


        })
    })

})