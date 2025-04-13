#!/usr/bin/env node

const { ethers } = require("ethers");
const fs = require("fs").promises;
const path = require("path");
const prompt = require("prompt-sync")({ sigint: true });

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
];

// Store private key in the game folder
const CONFIG_DIR = path.join(process.cwd(), "snakeGameConfig");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

async function getPrivateKey() {
  try {
    // Try to read existing private key
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    try {
      const config = JSON.parse(await fs.readFile(CONFIG_FILE, "utf8"));
      if (config.privateKey) {
        return config.privateKey;
      }
    } catch (error) {
      // File doesn't exist or is invalid, continue to prompt
    }

    // Prompt for private key without echoing input
    console.log("Please enter your private key (input will be hidden, it will be stored securely in snakeGameConfig/config.json):");
    const privateKey = prompt("", { echo: "" }); // Empty echo hides input
    const trimmedKey = privateKey.trim();

    // Validate private key format
    try {
      new ethers.Wallet(trimmedKey);
      // Store private key
      await fs.writeFile(
        CONFIG_FILE,
        JSON.stringify({ privateKey: trimmedKey }, null, 2)
      );
      console.log("Private key saved securely in snakeGameConfig/config.json.");
      return trimmedKey;
    } catch (error) {
      console.error("Invalid private key. Please try again.");
      return getPrivateKey(); // Retry
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
  const players = playerPrivateKeys.map(
    (key) => new ethers.Wallet(key.trim(), provider)
  );

  console.log(`Playing with ${players.length} player(s):`);
  players.forEach((p, i) => console.log(`Player ${i + 1}: ${p.address}`));

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

  // Game state per player
  const gameStates = players.map((player) => ({
    address: player.address,
    score: 0,
    moves: 0,
    snakeHead: { x: 10, y: 10 }, // Starting position
    food: [],
    mintedNFTs: [],
  }));

  // Start game for each player
  for (const player of players) {
    const gameWithPlayer = snakeGame.connect(player);
    try {
      const tx = await gameWithPlayer.startGame();
      await tx.wait();
      console.log(`Player ${player.address} started the game`);
    } catch (error) {
      console.error(`Player ${player.address} failed to start:`, error.message);
    }
  }

  // Main game loop
  let running = true;
  while (running) {
    for (let i = 0; i < players.length && running; i++) {
      const player = players[i];
      const state = gameStates[i];
      const gameWithPlayer = snakeGame.connect(player);

      // Fetch current game state
      try {
        state.score = Number(await gameWithPlayer.getScore(player.address));
        state.moves = Number(
          await gameWithPlayer.playerMoveCount(player.address)
        );
        state.snakeHead = await gameWithPlayer.getSnakeHead();
        state.food = await gameWithPlayer.getFood();
      } catch (error) {
        console.error(`Error fetching state for ${player.address}:`, error.message);
        continue;
      }

      // Move toward nearest food
      let moveTx;
      if (state.food.length > 0) {
        const targetFood = state.food[0]; // Simplest: target first food
        if (targetFood.x > state.snakeHead.x) {
          moveTx = await gameWithPlayer.moveRight();
        } else if (targetFood.x < state.snakeHead.x) {
          moveTx = await gameWithPlayer.moveLeft();
        } else if (targetFood.y > state.snakeHead.y) {
          moveTx = await gameWithPlayer.moveDown();
        } else if (targetFood.y < state.snakeHead.y) {
          moveTx = await gameWithPlayer.moveUp();
        }
        if (moveTx) {
          await moveTx.wait();
          state.moves++;
        }
      }

      // Check for NFT minting eligibility
      for (const nft of nftContracts) {
        if (
          state.score >= nft.score &&
          !state.mintedNFTs.includes(nft.class)
        ) {
          try {
            const nftWithPlayer = nft.contract.connect(player);
            const tx = await nftWithPlayer.mint();
            await tx.wait();
            state.mintedNFTs.push(nft.class);
            console.log(
              `Player ${player.address} minted NFT Class ${nft.class} at score ${state.score}`
            );
          } catch (error) {
            console.error(
              `Player ${player.address} failed to mint NFT Class ${nft.class}:`,
              error.message
            );
          }
        }
      }

      // Update terminal
      displayGameState(gameStates);

      // Stop if all players have minted Class 10 NFT
      if (
        players.every((_, idx) => gameStates[idx].mintedNFTs.includes(10))
      ) {
        running = false;
      }

      // Delay to avoid overwhelming the testnet
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("Game completed. Final state:");
  displayGameState(gameStates, true);
}

function displayGameState(states, final = false) {
  // Clear previous output
  if (!final) {
    process.stdout.write("\x1Bc"); // Clear terminal
  }

  for (const state of states) {
    // Draw board
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


