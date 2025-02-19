// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useFeature } from '@growthbook/growthbook-react';
import { useAppsBackend, useResolveSuiNSName } from '@mysten/core';
import { useAllBalances, useBalance } from '@mysten/dapp-kit';
import { Info12, Unpin16, Pin16 } from '@mysten/icons';

import { type CoinBalance as CoinBalanceType } from '@mysten/sui.js/client';
import { Coin } from '@mysten/sui.js/framework';
import { SUI_TYPE_ARG, formatAddress } from '@mysten/sui.js/utils';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { PortfolioName } from './PortfolioName';
import { TokenIconLink } from './TokenIconLink';
import { TokenLink } from './TokenLink';
import { TokenList } from './TokenList';
import SvgSuiTokensStack from './TokensStackIcon';
import { CoinBalance } from './coin-balance';
import Interstitial, { type InterstitialConfig } from '../interstitial';
import { useOnrampProviders } from '../onramp/useOnrampProviders';
import { LargeButton } from '_app/shared/LargeButton';
import { Text } from '_app/shared/text';
import Alert from '_components/alert';
import Loading from '_components/loading';
import { filterAndSortTokenBalances } from '_helpers';
import { useAppSelector, useCoinsReFetchingConfig } from '_hooks';
import { ampli } from '_src/shared/analytics/ampli';
import { API_ENV } from '_src/shared/api-env';
import { FEATURES } from '_src/shared/experimentation/features';
import { AccountsList } from '_src/ui/app/components/accounts/AccountsList';
import { UnlockAccountButton } from '_src/ui/app/components/accounts/UnlockAccountButton';
import { useActiveAccount } from '_src/ui/app/hooks/useActiveAccount';
import { usePinnedCoinTypes } from '_src/ui/app/hooks/usePinnedCoinTypes';
import { useRecognizedPackages } from '_src/ui/app/hooks/useRecognizedPackages';
import PageTitle from '_src/ui/app/shared/PageTitle';
import FaucetRequestButton from '_src/ui/app/shared/faucet/FaucetRequestButton';

type TokenDetailsProps = {
	coinType?: string;
};

function PinButton({ unpin, onClick }: { unpin?: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			className="border-none bg-transparent text-transparent group-hover/coin:text-steel hover:!text-hero cursor-pointer"
			aria-label={unpin ? 'Unpin Coin' : 'Pin Coin'}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick();
			}}
		>
			{unpin ? <Unpin16 /> : <Pin16 />}
		</button>
	);
}

function MyTokens({
	coinBalances,
	isLoading,
	isFetched,
}: {
	coinBalances: CoinBalanceType[];
	isLoading: boolean;
	isFetched: boolean;
}) {
	const apiEnv = useAppSelector(({ app }) => app.apiEnv);

	const recognizedPackages = useRecognizedPackages();
	const [pinnedCoinTypes, { pinCoinType, unpinCoinType }] = usePinnedCoinTypes();

	const { recognized, pinned, unrecognized } = useMemo(
		() =>
			coinBalances?.reduce(
				(acc, coinBalance) => {
					if (recognizedPackages.includes(coinBalance.coinType.split('::')[0])) {
						acc.recognized.push(coinBalance);
					} else if (pinnedCoinTypes.includes(coinBalance.coinType)) {
						acc.pinned.push(coinBalance);
					} else {
						acc.unrecognized.push(coinBalance);
					}
					return acc;
				},
				{
					recognized: [] as CoinBalanceType[],
					pinned: [] as CoinBalanceType[],
					unrecognized: [] as CoinBalanceType[],
				},
			) ?? { recognized: [], pinned: [], unrecognized: [] },
		[coinBalances, recognizedPackages, pinnedCoinTypes],
	);

	// Avoid perpetual loading state when fetching and retry keeps failing; add isFetched check.
	const isFirstTimeLoading = isLoading && !isFetched;

	return (
		<Loading loading={isFirstTimeLoading}>
			{recognized.length > 0 && (
				<TokenList title="My Coins" defaultOpen>
					{recognized.map((coinBalance) => (
						<TokenLink key={coinBalance.coinType} coinBalance={coinBalance} />
					))}
				</TokenList>
			)}

			{pinned.length > 0 && (
				<TokenList title="Pinned Coins" defaultOpen>
					{pinned.map((coinBalance) => (
						<TokenLink
							key={coinBalance.coinType}
							coinBalance={coinBalance}
							centerAction={
								<PinButton
									unpin
									onClick={() => {
										ampli.unpinnedCoin({ coinType: coinBalance.coinType });
										unpinCoinType(coinBalance.coinType);
									}}
								/>
							}
						/>
					))}
				</TokenList>
			)}

			{unrecognized.length > 0 && (
				<TokenList
					title={
						unrecognized.length === 1
							? `${unrecognized.length} Unrecognized Coin`
							: `${unrecognized.length} Unrecognized Coins`
					}
					defaultOpen={apiEnv !== API_ENV.mainnet}
				>
					{unrecognized.map((coinBalance) => (
						<TokenLink
							key={coinBalance.coinType}
							coinBalance={coinBalance}
							centerAction={
								<PinButton
									onClick={() => {
										ampli.pinnedCoin({ coinType: coinBalance.coinType });
										pinCoinType(coinBalance.coinType);
									}}
								/>
							}
						/>
					))}
				</TokenList>
			)}
		</Loading>
	);
}

function TokenDetails({ coinType }: TokenDetailsProps) {
	const [interstitialDismissed, setInterstitialDismissed] = useState<boolean>(false);
	const activeCoinType = coinType || SUI_TYPE_ARG;
	const activeAccount = useActiveAccount();
	const activeAccountAddress = activeAccount?.address;
	const { data: domainName } = useResolveSuiNSName(activeAccountAddress);
	const { staleTime, refetchInterval } = useCoinsReFetchingConfig();
	const {
		data: coinBalance,
		isError,
		isLoading,
		isFetched,
	} = useBalance(
		{ coinType: activeCoinType, owner: activeAccountAddress! },
		{ enabled: !!activeAccountAddress, refetchInterval, staleTime },
	);
	const { apiEnv } = useAppSelector((state) => state.app);
	const { request } = useAppsBackend();
	const { data } = useQuery({
		queryKey: ['apps-backend', 'monitor-network'],
		queryFn: () =>
			request<{ degraded: boolean }>('monitor-network', {
				project: 'WALLET',
			}),
		// Keep cached for 2 minutes:
		staleTime: 2 * 60 * 1000,
		retry: false,
		enabled: apiEnv === API_ENV.mainnet,
	});

	const {
		data: coinBalances,
		isLoading: coinBalancesLoading,
		isFetched: coinBalancesFetched,
	} = useAllBalances(
		{ owner: activeAccountAddress! },
		{
			enabled: !!activeAccountAddress,
			staleTime,
			refetchInterval,
			select: filterAndSortTokenBalances,
		},
	);

	const walletInterstitialConfig = useFeature<InterstitialConfig>(
		FEATURES.WALLET_INTERSTITIAL_CONFIG,
	).value;

	const { providers } = useOnrampProviders();

	const tokenBalance = BigInt(coinBalance?.totalBalance ?? 0);

	const coinSymbol = useMemo(() => Coin.getCoinSymbol(activeCoinType), [activeCoinType]);
	// Avoid perpetual loading state when fetching and retry keeps failing add isFetched check
	const isFirstTimeLoading = isLoading && !isFetched;

	useEffect(() => {
		const dismissed =
			walletInterstitialConfig?.dismissKey &&
			localStorage.getItem(walletInterstitialConfig.dismissKey);
		setInterstitialDismissed(dismissed === 'true');
	}, [walletInterstitialConfig?.dismissKey]);

	if (walletInterstitialConfig?.enabled && !interstitialDismissed) {
		return (
			<Interstitial
				{...walletInterstitialConfig}
				onClose={() => {
					setInterstitialDismissed(true);
				}}
			/>
		);
	}
	const accountHasSui = coinBalances?.some(({ coinType }) => coinType === SUI_TYPE_ARG);
	if (!activeAccountAddress) {
		return null;
	}
	return (
		<>
			{apiEnv === API_ENV.mainnet && data?.degraded && (
				<div className="rounded-2xl bg-warning-light border border-solid border-warning-dark/20 text-warning-dark flex items-center py-2 px-3 mb-4">
					<Info12 className="shrink-0" />
					<div className="ml-2">
						<Text variant="pBodySmall" weight="medium">
							We're sorry that the app is running slower than usual. We're working to fix the issue
							and appreciate your patience.
						</Text>
					</div>
				</div>
			)}

			<Loading loading={isFirstTimeLoading}>
				{coinType && <PageTitle title={coinSymbol} back="/tokens" />}

				<div
					className="flex flex-col h-full flex-1 flex-grow items-center overflow-y-auto gap-8"
					data-testid="coin-page"
				>
					<AccountsList />
					<div className="flex flex-col w-full">
						<PortfolioName
							name={activeAccount.nickname ?? domainName ?? formatAddress(activeAccountAddress)}
						/>
						{activeAccount.isLocked ? null : (
							<>
								<div
									data-testid="coin-balance"
									className="bg-hero/5 rounded-2xl py-5 px-4 flex flex-col w-full gap-3 items-center mt-4"
								>
									{accountHasSui ? (
										<CoinBalance amount={BigInt(tokenBalance)} type={activeCoinType} />
									) : (
										<div className="flex flex-col gap-5">
											<div className="flex flex-col flex-nowrap justify-center items-center text-center px-2.5">
												<SvgSuiTokensStack className="h-14 w-14 text-steel" />
												<div className="flex flex-col gap-2 justify-center">
													<Text variant="pBodySmall" color="gray-80" weight="normal">
														To conduct transactions on the Sui network, you need SUI in your wallet.
													</Text>
												</div>
											</div>
											<FaucetRequestButton />
										</div>
									)}
									{isError ? (
										<Alert>
											<div>
												<strong>Error updating balance</strong>
											</div>
										</Alert>
									) : null}
									<div className="grid grid-cols-3 gap-3 w-full">
										<LargeButton
											center
											to="/onramp"
											disabled={(coinType && coinType !== SUI_TYPE_ARG) || !providers?.length}
										>
											Buy
										</LargeButton>

										<LargeButton
											center
											data-testid="send-coin-button"
											to={`/send${
												coinBalance?.coinType
													? `?${new URLSearchParams({
															type: coinBalance.coinType,
													  }).toString()}`
													: ''
											}`}
											disabled={!tokenBalance}
										>
											Send
										</LargeButton>

										<LargeButton center to="/" disabled>
											Swap
										</LargeButton>
									</div>
									<div className="w-full">
										{activeCoinType === SUI_TYPE_ARG ? (
											<TokenIconLink
												disabled={!tokenBalance}
												accountAddress={activeAccountAddress}
											/>
										) : null}
									</div>
								</div>
							</>
						)}
					</div>
					{activeAccount.isLocked ? (
						<UnlockAccountButton account={activeAccount} />
					) : (
						<MyTokens
							coinBalances={coinBalances ?? []}
							isLoading={coinBalancesLoading}
							isFetched={coinBalancesFetched}
						/>
					)}
				</div>
			</Loading>
		</>
	);
}

export default TokenDetails;
