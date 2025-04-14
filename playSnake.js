#!/usr/bin/env node

const { ethers } = require("ethers");
const fs = require("fs").promises;
const path = require("path");
const prompt = require("prompt-sync")({ sigint: true });
const readline = require("readline");

// Configuration
const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz";
const SNAKE_GAME_ADDRESS = "0x8fedFBf3A7D8Cebb328F74109e032f98CB45CbFB";
const NFT_CONTRACTS = [
  { class: 1, address: "0xC82aaBF572AA36ff902ed8E202877542B1Dd24bc", score: 100 },
  { class: 2, address: "0x824af44003a69F03384d2f4462a03629F45e520a", score: 200 },
  { class: 3, address: "0x6a5F57e6b03A96Fc69c1Ae59B70854804bCB06E1", score: 300 },
  { class: 4, address: "0x01170Ec3F1cC26A9a2494b3dBf092890E43EDaa4", score: 400 },
  { class: 5, address: "0x7fC72Be848d59c7a0494a3eb13E1c5fCEc803B37", score: 500 },
  { class: 6, address: "0x61928E2640C170Ceb62F97752F60faDBe84878F8", score: 600 },
  { class: 7, address: "0x0F1cbc1096389896B1d36c4D5220463336aB9769", score: 700 },
  { class: 8, address: "0x13B4a46Ef8e2536eADd782682A9f7ab20079ACFc", score: 800 },
  { class: 9, address: "0xb0FF6f88A143795B3C86725DAbbF4Ae042932BE5", score: 900 },
  { class: 10, address: "0x885AD21f88CADf8bC60D4373b4666B22586082d8", score: 1000 },
];

// Minimal ABI for SnakeGame contract
const SNAKE_GAME_ABI = [
  "function startGame() public",
  "function getScore(address player) public view returns (uint256)",
  "function playerMoveCount(address player) public view returns (uint256)",
  "function getSnakeHead() public view returns (tuple(uint256 x, uint256 y))",
  "function getFood() public view returns (tuple(uint256 x, uint256 y)[])",
  "function moveUp() public",
  "function moveDown() public",
  "function moveLeft() public",
  "function moveRight() public",
];

// Minimal ABI for SnakeNFT contracts
const NFT_ABI = [
  "function mint() public",
  "function hasMinted(address account) public view returns (bool)",
];

// Store private key in the game folder
const CONFIG_DIR = path.join(process.cwd(), "snakeGameConfig");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

async function getPrivateKey() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    try {
      const config = JSON.parse(await fs.readFile(CONFIG_FILE, "utf8"));
      if (config.privateKey) {
        return config.privateKey;
      }
    } catch (error) {
      // File doesn't exist or is invalid
    }

    console.log("Please enter your private key (input will be hidden, it will be stored securely in snakeGameConfig/config.json):");
    const privateKey = prompt("", { echo: "" });
    const trimmedKey = privateKey.trim();

    try {
      new ethers.Wallet(trimmedKey);
      await fs.writeFile(
        CONFIG_FILE,
        JSON.stringify({ privateKey: trimmedKey }, null, 2)
      );
      console.log("Private key saved securely in snakeGameConfig/config.json.");
      return trimmedKey;
    } catch (error) {
      console.error("Invalid private key. Please try again.");
      return getPrivateKey();
    }
  } catch (error) {
    console.error("Error accessing config directory:", error.message);
    process.exit(1);
  }
}

async function main() {
  // Get private key
  const privateKey = await getPrivateKey();
  const playerPrivateKeys = [privateKey];

  // Initialize provider and wallets
  const provider = new ethers.JsonRpcProvider(MONAD_TESTNET_RPC_URL);
  const players = playerPrivateKeys.map((key) => {
    const wallet = new ethers.Wallet(key.trim(), provider);
    console.log(`Player address: ${wallet.address}`);
    return wallet;
  });

  // Check balance
  for (const player of players) {
    const balance = await provider.getBalance(player.address);
    console.log(`Balance for ${player.address}: ${ethers.formatEther(balance)} ETH`);
    if (balance === 0n) {
      throw new Error(`Player ${player.address} has no funds`);
    }
  }

  // Connect to contracts
  const snakeGame = new ethers.Contract(
    SNAKE_GAME_ADDRESS,
    SNAKE_GAME_ABI,
    provider
  );
  const nftContracts = NFT_CONTRACTS.map((nft) => ({
    class: nft.class,
    score: nft.score,
    contract: new ethers.Contract(nft.address, NFT_ABI, provider),
  }));

  // Initialize game state
  const gameStates = [];
  for (const player of players) {
    const gameWithPlayer = snakeGame.connect(player);
    let score, moves, snakeHead, food;
    try {
      score = Number(await gameWithPlayer.getScore(player.address));
      moves = Number(await gameWithPlayer.playerMoveCount(player.address));
      const rawHead = await gameWithPlayer.getSnakeHead();
      snakeHead = { x: Number(rawHead.x), y: Number(rawHead.y) };
      const rawFood = await gameWithPlayer.getFood();
      food = rawFood.map((f) => ({ x: Number(f.x), y: Number(f.y) }));
    } catch (error) {
      console.error(`Failed to fetch state for ${player.address}:`, error.message);
      continue;
    }

    // Check minted NFTs
    const mintedNFTs = [];
    for (const nft of nftContracts) {
      try {
        const hasMinted = await nft.contract.connect(player).hasMinted(player.address);
        if (hasMinted) {
          mintedNFTs.push(nft.class);
        }
      } catch (error) {
        console.error(`Failed to check hasMinted for Class ${nft.class}:`, error.message);
      }
    }

    gameStates.push({
      address: player.address,
      score,
      moves,
      snakeHead,
      food,
      mintedNFTs,
    });
  }

  if (gameStates.length === 0) {
    throw new Error("No players could be initialized");
  }

  // Skip startGame if initialized
  for (const player of players) {
    const gameWithPlayer = snakeGame.connect(player);
    const moves = Number(await gameWithPlayer.playerMoveCount(player.address));
    if (moves === 0) {
      try {
        console.log(`Calling startGame for ${player.address}`);
        const tx = await gameWithPlayer.startGame({ gasLimit: 150000 });
        console.log(`startGame tx: ${tx.hash} | data: ${tx.data}`);
        await tx.wait();
        console.log(`Player ${player.address} started the game`);
      } catch (error) {
        console.error(`Player ${player.address} failed to start:`, error.message);
        continue;
      }
    } else {
      console.log(`Player ${player.address} already initialized with ${moves} moves`);
    }
  }

  // Log initial state
  console.log("Initial game state:");
  displayGameState(gameStates, true);

  // Main game loop
  let running = true;
  while (running) {
    for (let i = 0; i < players.length && running; i++) {
      const player = players[i];
      const state = gameStates[i];
      const gameWithPlayer = snakeGame.connect(player);

      // Fetch latest state
      try {
        state.score = Number(await gameWithPlayer.getScore(player.address));
        state.moves = Number(await gameWithPlayer.playerMoveCount(player.address));
        const rawHead = await gameWithPlayer.getSnakeHead();
        state.snakeHead = { x: Number(rawHead.x), y: Number(rawHead.y) };
        const rawFood = await gameWithPlayer.getFood();
        state.food = rawFood.map((f) => ({ x: Number(f.x), y: Number(f.y) }));
        console.log(`Fetched state: head=(${state.snakeHead.x},${state.snakeHead.y}), score=${state.score}, food=${JSON.stringify(state.food)}`);
      } catch (error) {
        console.error(`Error fetching state for ${player.address}:`, error.message);
        continue;
      }

      // Check NFT minting
      for (const nft of nftContracts) {
        if (state.score >= nft.score && !state.mintedNFTs.includes(nft.class)) {
          try {
            const nftWithPlayer = nft.contract.connect(player);
            const hasMinted = await nftWithPlayer.hasMinted(player.address);
            if (!hasMinted) {
              const tx = await nftWithPlayer.mint({ gasLimit: 200000 });
              console.log(`Mint tx for Class ${nft.class}: ${tx.hash} | data: ${tx.data}`);
              await tx.wait();
              state.mintedNFTs.push(nft.class);
              console.log(
                `Player ${player.address} minted NFT Class ${nft.class} at score ${state.score}`
              );
            } else {
              console.log(
                `Player ${player.address} already minted NFT Class ${nft.class}`
              );
              state.mintedNFTs.push(nft.class);
            }
          } catch (error) {
            console.error(
              `Player ${player.address} failed to mint NFT Class ${nft.class}:`,
              error.message
            );
          }
        }
      }

      // Stop after Class 10
      if (players.every((_, idx) => gameStates[idx].mintedNFTs.includes(10))) {
        running = false;
        break; // Exit for loop immediately
      }

      // Move toward nearest food
      let moveTx;
      if (state.food.length > 0) {
        const targetFood = state.food[0];
        console.log(`Player ${player.address} targeting food at (${targetFood.x},${targetFood.y}) from (${state.snakeHead.x},${state.snakeHead.y})`);
        try {
          if (targetFood.x > state.snakeHead.x && state.snakeHead.x < 19) {
            moveTx = await gameWithPlayer.moveRight({ gasLimit: 150000 });
          } else if (targetFood.x < state.snakeHead.x && state.snakeHead.x > 0) {
            moveTx = await gameWithPlayer.moveLeft({ gasLimit: 150000 });
          } else if (targetFood.y > state.snakeHead.y && state.snakeHead.y < 19) {
            moveTx = await gameWithPlayer.moveDown({ gasLimit: 150000 });
          } else if (targetFood.y < state.snakeHead.y && state.snakeHead.y > 0) {
            moveTx = await gameWithPlayer.moveUp({ gasLimit: 150000 });
          } else {
            console.log(`No valid move for ${player.address}`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait before retry
            continue;
          }
          if (moveTx) {
            console.log(`Move tx for ${player.address}: ${moveTx.hash} | data: ${moveTx.data}`);
            await moveTx.wait();
            state.moves++;
            console.log(`Move completed: new head=(${state.snakeHead.x},${state.snakeHead.y})`);
          }
        } catch (error) {
          console.error(`Move failed for ${player.address}:`, error.message);
          continue;
        }
      } else {
        console.log(`No food available for ${player.address}`);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait before retry
        continue;
      }

      // Update terminal
      displayGameState(gameStates);

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("Game completed. Final state:");
  displayGameState(gameStates, true);
}

function displayGameState(states, final = false) {
  if (!final) {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  }

  for (const state of states) {
    const board = Array(20)
      .fill()
      .map(() => Array(20).fill("."));
    board[state.snakeHead.y][state.snakeHead.x] = "S";
    for (const food of state.food) {
      board[food.y][food.x] = "F";
    }

    console.log(`Player: ${state.address}`);
    console.log(`Score: ${state.score} | Moves: ${state.moves}`);
    console.log(`NFTs Minted: ${state.mintedNFTs.join(", ") || "None"}`);
    console.log("Board:");
    console.log(board.map((row) => row.join("")).join("\n"));
    console.log("---");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
