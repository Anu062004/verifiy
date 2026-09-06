import { BrowserProvider, Contract } from "ethers";

export const GALILEO_CHAIN_ID = 16602;
const GALILEO_CHAIN_HEX = "0x40da";
export const GALILEO_RPC = "https://evmrpc-testnet.0g.ai";
export const EXPLORER = "https://chainscan-galileo.0g.ai";

export const REGISTRY_ABI = [
  "function submitRecord(bytes32 storageRootHash,bytes32 photoCommitment,bytes32 matchedUrlCommitment) returns (uint256)",
];

type InjectedEthereum = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function ethereum(): InjectedEthereum {
  const injected = (window as unknown as { ethereum?: InjectedEthereum }).ethereum;
  if (!injected) throw new Error("No browser wallet found. Install MetaMask or another injected wallet, then try again.");
  return injected;
}

/** Connect the browser wallet and switch it to 0G Galileo. Returns the account address. */
export async function connectWallet(): Promise<string> {
  const provider = new BrowserProvider(ethereum());
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  if (!accounts.length) throw new Error("Wallet connection was rejected.");
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: GALILEO_CHAIN_HEX }]);
  } catch (error: unknown) {
    if ((error as { code?: number })?.code === 4902) {
      await provider.send("wallet_addEthereumChain", [{
        chainId: GALILEO_CHAIN_HEX,
        chainName: "0G Galileo Testnet",
        rpcUrls: [GALILEO_RPC],
        blockExplorerUrls: [EXPLORER],
        nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
      }]);
    } else {
      throw error;
    }
  }
  return accounts[0];
}

/** Send submitRecord from the user's wallet. The user pays gas. Resolves with the tx hash. */
export async function submitRecordAsUser(
  contractAddress: string,
  storageRootHash: string,
  photoCommitment: string,
  matchedUrlCommitment: string,
): Promise<string> {
  const provider = new BrowserProvider(ethereum());
  const signer = await provider.getSigner();
  const registry = new Contract(contractAddress, REGISTRY_ABI, signer);
  const tx = await registry.submitRecord(storageRootHash, photoCommitment, matchedUrlCommitment);
  const receipt = await tx.wait(1);
  if (receipt?.status !== 1) throw new Error(`Transaction did not succeed: ${tx.hash}`);
  return tx.hash as string;
}

export function shortAddress(address?: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}
