import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    "mantle-sepolia": {
      url: "https://rpc.sepolia.mantle.xyz",
      accounts: [process.env.MANTLE_PRIVATE_KEY!],
      chainId: 5003,
    } as any,
    mantle: {
      url: "https://rpc.mantle.xyz",
      accounts: [process.env.MANTLE_PRIVATE_KEY!],
      chainId: 5000,
    } as any,
  },
};

export default config;
