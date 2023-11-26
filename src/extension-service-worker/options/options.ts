import { getConfig, DefaultEndpoint, CheckSupportableEndpointURL } from './../config';

import * as bootstrap from 'bootstrap';

const config = getConfig();

enum preflightCode {
  Loading = 0,
  Done,
  NotDone,
  Failure,
}

interface preflightStatus {
	check: preflightCheck;
	code: preflightCode;
	message: string;
}

function updateStatusImage(img: JQuery, statusCode: preflightCode) {
	switch (statusCode) {
		case preflightCode.Loading:
			img.attr('src', '/options/spinner.svg');
			img.attr('alt', '&#x231B;');
			break;
		case preflightCode.Done:
			img.attr('src', '/options/done.svg');
			img.attr('alt', '&#x2705;');
			break;
		case preflightCode.NotDone:
			img.attr('src', '/options/not-done.svg');
			img.attr('alt', '&#x1F4CB;');
			break;
		default:
			img.attr('src', '/options/failure.svg');
			img.attr('alt', '&#x274C;');
	}
}

class preflightCheck {
	readonly id: string;
	readonly element: JQuery;
	lastStatus: preflightStatus;

	constructor(id: string) {
		this.id = id;
		this.element = $('#' + this.id);
	}

	reflectStatus(status: preflightStatus) {
		if (this.lastStatus != null && this.lastStatus.code == status.code && this.lastStatus.message == status.message) {
			return;
		}
		let collapseElement = this.element.find('.collapse');
		switch (status.code) {
			case preflightCode.Loading:
				collapseElement.collapse('hide');
				break;
			case preflightCode.Done:
				collapseElement.collapse('hide');
				break;
			case preflightCode.NotDone:
				collapseElement.collapse('show');
				break;
			default:
				collapseElement.collapse('show');
		}
		updateStatusImage(this.element.find('.status'), status.code);
		this.element.find('.explanation').text(status.message);
		this.lastStatus = status;
	}

	async status(): Promise<preflightStatus> {
		throw new Error('implemented in subclasses');
	}
}

class chainConfigs extends preflightCheck {
	domInitialized = false;
	allChainsExpanded = false;
	tasks: (() => Promise<any>)[] = [];

	constructor() {
		super('chain-configs');
	}

	processTasks = async () => {
		if (this.tasks.length > 0) {
			const startTime = Date.now();
			while (this.tasks.length > 0 && (Date.now() - startTime) < 10) {
				const thisTask = this.tasks.shift();
				await thisTask();
			}
		}
		if (this.tasks.length > 0) {
			setTimeout(this.processTasks, 10);
		} else {
			setTimeout(this.processTasks, 100);
		}
	}

	initializeDOMRow = async (chainRow: JQuery) => {
		let chainConfig = await config.getChainConfig(parseInt(chainRow.attr('data-chain-id')));
		chainRow.addClass(chainConfig.isConfigured() ? 'configured' : 'not-configured');
		chainRow.removeClass(chainConfig.isConfigured() ? 'not-configured' : 'configured');
		chainRow.empty();
		let chainCell = $('<td class="chain"/>');
		const iconURL = chainConfig.IconURL();
		if (iconURL !== null) {
			let chainIcon = $('<img class="chain-icon" loading="lazy"/>');
			chainIcon.attr('src', iconURL);
			chainCell.append(chainIcon);
		}
		let chainName = $('<span class="chain-name"/>');
		chainName.text(chainConfig.ChainName);
		chainCell.append(chainName);
		chainRow.append(chainCell);
		let providersCell = $('<td class="providers"/>');
		if (chainConfig.RPCEndpoints.length == 0) {
			let noEndpointConfigured = $('<span class="no-endpoint-configured"/>');
			noEndpointConfigured.text('No provider configured.');
			providersCell.append(noEndpointConfigured);
		} else {
			let isFirst = true;
			for (let rpcEndpointURL of chainConfig.RPCEndpoints) {
				let endpointButton = $('<button class="btn btn-light rpc-endpoint"/>');
				if (isFirst) {
					endpointButton.addClass('first-button');
					isFirst = false;
				}
				let endpointNameSpan = $('<span class="rpc-endpoint-name"/>');
				let deleteButton = $('<button class="btn btn-danger btn-sm delete">&#x274C;</button>');
				let foundDefault: DefaultEndpoint = null;
				for (let defaultEndpoint of chainConfig.DefaultEndpoints) {
					if (rpcEndpointURL == defaultEndpoint.EndpointURL) {
						foundDefault = defaultEndpoint;
						break;
					}
				}
				if (foundDefault == null) {
					endpointButton.addClass('rpc-endpoint-custom');
					endpointButton.attr('alt', rpcEndpointURL);
					endpointButton.attr('title', rpcEndpointURL);
					endpointNameSpan.text((new DefaultEndpoint(null, rpcEndpointURL)).FriendlyName());
					deleteButton.attr('data-endpoint-url', rpcEndpointURL);
				} else {
					endpointButton.addClass('rpc-endpoint-default');
					endpointButton.attr('alt', foundDefault.EndpointURL);
					endpointButton.attr('title', foundDefault.EndpointURL);
					endpointNameSpan.text(foundDefault.FriendlyName());
					deleteButton.attr('data-endpoint-url', foundDefault.EndpointURL);
				}
				endpointButton.append(endpointNameSpan);
				deleteButton.attr('data-chain-id', chainConfig.ChainID.toString());
				deleteButton.click((async (event: Event) => await this.deleteEndpoint(event, chainRow, deleteButton)).bind(this));
				endpointButton.click(((event: Event) => event.preventDefault()).bind(this));
				endpointButton.append(deleteButton);
				providersCell.append(endpointButton);
			}
		}
		let addProviderTextbox = $('<input type="text" class="form-control add-provider hidden" placeholder="http://localhost:1337"/>');
		addProviderTextbox.blur((async (event: Event) => await this.addNewProvider(event, chainRow, false)).bind(this));
		addProviderTextbox.keypress(((event: KeyboardEvent) => this.addNewProviderKeypress(event, chainRow)).bind(this));
		providersCell.append(addProviderTextbox);
		let addProviderError = $('<span class="add-provider add-provider-error"/>');
		providersCell.append(addProviderError);
		let addProviderButton = $('<button class="btn btn-light add-provider">+</button>');
		addProviderButton.click(((event: Event) => this.focusNewProvider(event, chainRow)).bind(this));
		providersCell.append(addProviderButton);
		chainRow.append(providersCell);
		let buttonCell = $('<td/>');
		if (chainConfig.DefaultEndpoints.length == 0) {
			let noPublicEndpointSpan = $('<span class="no-public-endpoint"/>');
			noPublicEndpointSpan.text('No public endpoint exists.');
			buttonCell.append(noPublicEndpointSpan);
		} else {
			let remainingDefaultEndpoints = [];
			for (let defaultEndpoint of chainConfig.DefaultEndpoints) {
				let isAlreadyPresent = false;
				for (const existingEndpoint of chainConfig.RPCEndpoints) {
					if (existingEndpoint == defaultEndpoint.EndpointURL) {
						isAlreadyPresent = true;
						break;
					}
				}
				if (!isAlreadyPresent) {
					remainingDefaultEndpoints.push(defaultEndpoint);
				}
			}
			let isFirst = true;
			if (remainingDefaultEndpoints.length > 1) {
				let allButton = $('<button class="btn btn-outline-primary btn-sm use-all-endpoints">All</button>');
				if (isFirst) {
					allButton.addClass('first-button');
					isFirst = false;
				}
				allButton.attr('data-chainid', chainConfig.ChainID.toString());
				allButton.click((async (event: Event) => await this.useAllPublicEndpoints(event, chainRow)).bind(this));
				buttonCell.append(allButton);
			}
			let needExpandButton = remainingDefaultEndpoints.length > 3;
			if (needExpandButton) {
				let expandButton = $('<button class="btn btn-outline-secondary btn-sm expand-public-endpoints">Select...</button>');
				if (isFirst) {
					expandButton.addClass('first-button');
					isFirst = false;
				}
				expandButton.click(((event: Event) => this.expandPublicEndpoints(event, chainRow)).bind(this));
				buttonCell.append(expandButton);
			}
			for (let defaultEndpoint of remainingDefaultEndpoints) {
				let defaultButton = $('<button class="btn btn-sm public-endpoint"/>');
				if (isFirst) {
					defaultButton.addClass('first-button');
					isFirst = false;
				}
				defaultButton.addClass(chainConfig.DefaultEndpoints.length == 1 ? 'btn-outline-primary' : 'btn-outline-secondary');
				if (needExpandButton) {
					defaultButton.addClass('public-endpoint-hidden');
				}
				defaultButton.attr('data-endpoint-url', defaultEndpoint.EndpointURL);
				defaultButton.attr('alt', defaultEndpoint.EndpointURL);
				defaultButton.attr('title', defaultEndpoint.EndpointURL);
				defaultButton.text(defaultEndpoint.FriendlyName());
				defaultButton.click((async (event: Event) => await this.usePublicEndpoint(event, chainRow, defaultButton)).bind(this));
				buttonCell.append(defaultButton);
			}
		}
		chainRow.append(buttonCell);
	}

	initializeDOM = async () => {
		if (this.domInitialized) {
			return;
		}
		const chainConfigTable = $('#chain-configs-tbody');
		let criticalChainConfigs = [];
		let nonCriticalChainConfigs = [];
		for (let chainConfig of (await config.getChainConfigs())) {
			if (chainConfig.Critical) {
				criticalChainConfigs.push(chainConfig);
			} else {
				nonCriticalChainConfigs.push(chainConfig);
			}
		}
		let chainConfigs = [];
		for (let chainConfig of criticalChainConfigs) {
			chainConfigs.push(chainConfig);
		}
		for (let chainConfig of nonCriticalChainConfigs) {
			chainConfigs.push(chainConfig);
		}
		let alternate = false;
		let lastWasCritical = true;
		let allChainRows: JQuery[] = [];
		let nonCriticalRows: JQuery[] = [];
		for (let chainConfig of chainConfigs) {
			if (!chainConfig.Critical && lastWasCritical) {
				let transitionRow = $('<tr class="critical-to-not-critical"/>');
				let transitionCell = $('<td colspan="3"/>');
				let transitionButton = $('<button class="btn btn-info show-more">&#x25BC; Show more &#x25BC;</button>');
				transitionButton.click(((event: Event) => this.expandNonCritical(event, chainConfigTable)).bind(this));
				transitionCell.append(transitionButton);
				transitionRow.append(transitionCell);
				chainConfigTable.append(transitionRow);
			}
			let chainRow = $('<tr class="chain-config-row"/>');
			chainRow.attr('data-chain-id', chainConfig.ChainID.toString());
			chainRow.addClass(alternate ? 'table-odd' : 'table-even');
			chainRow.addClass(chainConfig.Critical ? 'critical' : 'not-critical');
			if (chainConfig.Critical) {
				await this.initializeDOMRow(chainRow);
			} else {
				nonCriticalRows.push(chainRow);
			}
			allChainRows.push(chainRow);
			chainConfigTable.append(chainRow);
			alternate = !alternate;
			lastWasCritical = chainConfig.Critical;
		}
		$('#chain-configs .rpc-endpoints-use-public').click((async (event: Event) => await this.useAllPublicEndpointsForAllChains(event, allChainRows)).bind(this));
		const batchSize = 32;
		for (let nonCriticalIndex = 0; nonCriticalIndex < nonCriticalRows.length; nonCriticalIndex += batchSize) {
			let rowsToProcess: JQuery[] = [];
			for (let i = nonCriticalIndex; i < nonCriticalRows.length && i < nonCriticalIndex + batchSize; i++) {
				rowsToProcess.push(nonCriticalRows[i]);
			}
			this.tasks.push(async () => {
				for (let rowToProcess of rowsToProcess) {
					await this.initializeDOMRow(rowToProcess);
					if (this.allChainsExpanded) {
						rowToProcess.show();
					}
				}
			});
		}
		setTimeout(this.processTasks, 1000);
		this.domInitialized = true;
	}

	expandNonCritical = (event: Event, chainConfigTable: JQuery) => {
		event.preventDefault();
		chainConfigTable.find('tr.not-critical').show();
		chainConfigTable.find('button.show-more').hide();
		this.allChainsExpanded = true;
	}

	focusNewProvider = (event: Event, chainRow: JQuery) => {
		event.preventDefault();
		let addProviderButton = chainRow.find('button.add-provider');
		let addProviderTextbox = chainRow.find('input.add-provider');
		let addProviderError = chainRow.find('.add-provider-error');
		addProviderButton.hide();
		addProviderTextbox.addClass('displayed');
		addProviderTextbox.removeClass('hidden');
		addProviderTextbox.val('');
		addProviderError.text('');
		addProviderError.show();
		addProviderTextbox.focus();
	}

	addNewProvider = async (event: Event, chainRow: JQuery, fromKeyPress: boolean) => {
		event.preventDefault();
		let addProviderButton = chainRow.find('button.add-provider');
		let addProviderTextbox = chainRow.find('input.add-provider');
		let addProviderError = chainRow.find('.add-provider-error');
		let rpcEndpointURL = addProviderTextbox.val().toString().trim();
		if (rpcEndpointURL != '') {
			let errMessage = CheckSupportableEndpointURL(rpcEndpointURL, true);
			if (errMessage != '') {
				addProviderError.text(errMessage);
				if (fromKeyPress) {
					addProviderTextbox.focus();
					addProviderTextbox.select();
				}
			} else {
				let chainConfig = await config.getChainConfig(parseInt(chainRow.attr('data-chain-id')));
				let rpcEndpoints = chainConfig.RPCEndpoints;
				rpcEndpoints.push(rpcEndpointURL);
				chainConfig.setEndpoints(rpcEndpoints);
				await config.setChainConfig(chainConfig);
				addProviderError.text('');
				addProviderError.hide();
				addProviderTextbox.val('');
				addProviderTextbox.blur();
				addProviderTextbox.removeClass('displayed');
				addProviderTextbox.addClass('hidden');
				addProviderButton.show();
				this.tasks.push(async () => {
					this.initializeDOMRow(chainRow);
				});
			}
		} else {
			addProviderError.text('');
			addProviderError.hide();
				addProviderTextbox.removeClass('displayed');
				addProviderTextbox.addClass('hidden');
			addProviderButton.show();
		}
	}

	addNewProviderKeypress = (event: KeyboardEvent, chainRow: JQuery) => {
		if (event.key == 'Enter') {
			this.addNewProvider(event, chainRow, true);
		}
	}

	usePublicEndpoint = async (event: Event, chainRow: JQuery, endpointButton: JQuery) => {
		event.preventDefault();
		let chainConfig = await config.getChainConfig(parseInt(chainRow.attr('data-chain-id')));
		let rpcEndpoints = chainConfig.RPCEndpoints;
		rpcEndpoints.push(endpointButton.attr('data-endpoint-url'));
		chainConfig.setEndpoints(rpcEndpoints);
		await config.setChainConfig(chainConfig);
		this.tasks.push(async () => {
			this.initializeDOMRow(chainRow);
		});
	}

	useAllPublicEndpoints = async (event: Event, chainRow: JQuery) => {
		if (event !== null) {
			event.preventDefault();
		}
		let chainConfig = await config.getChainConfig(parseInt(chainRow.attr('data-chain-id')));
		let rpcEndpoints = chainConfig.RPCEndpoints;
		let changed = false;
		chainRow.find('button.public-endpoint[data-endpoint-url]').each((index: number, element: HTMLElement) => {
			rpcEndpoints.push($(element).attr('data-endpoint-url'));
			changed = true;
		});
		if (changed) {
			chainConfig.setEndpoints(rpcEndpoints);
			await config.setChainConfig(chainConfig);
			this.tasks.push(async () => {
				this.initializeDOMRow(chainRow);
			});
		}
	}

	useAllPublicEndpointsForAllChains = async (event: Event, allChainRows: JQuery[]) => {
		event.preventDefault();
		await config.addDefaultEndpointsToAllChainConfigs();
		for (let chainRow of allChainRows) {
			this.tasks.push(async () => {
				this.initializeDOMRow(chainRow);
			});
		}
	}

	expandPublicEndpoints = (event: Event, chainRow: JQuery) => {
		event.preventDefault();
		this.tasks.push(async () => {
			chainRow.find('.expand-public-endpoints').hide();
			chainRow.find('.public-endpoint-hidden').show();
		});
	}

	deleteEndpoint = async (event: Event, chainRow: JQuery, deleteButton: JQuery) => {
		event.preventDefault();
		let chainConfig = await config.getChainConfig(parseInt(chainRow.attr('data-chain-id')));
		let rpcEndpoints = [];
		let endpointURLToDelete = deleteButton.attr('data-endpoint-url');
		let changed = false;
		for (const existingEndpoint of chainConfig.RPCEndpoints) {
			if (existingEndpoint != endpointURLToDelete) {
				rpcEndpoints.push(existingEndpoint);
			} else {
				changed = true;
			}
		}
		if (changed) {
			chainConfig.setEndpoints(rpcEndpoints);
			await config.setChainConfig(chainConfig);
			this.tasks.push(async () => {
				this.initializeDOMRow(chainRow);
			});
		}
	}

	status = async (): Promise<preflightStatus> => {
		await this.initializeDOM();
		for (let chainConfig of (await config.getChainConfigs())) {
			if (chainConfig.Critical && !chainConfig.isConfigured()) {
				return {
					check: this,
					code: preflightCode.NotDone,
					message: 'Chain providers need to be configured.',
				};
			}
		}
		return {
			check: this,
			code: preflightCode.Done,
			message: 'Chain providers are configured!',
		};
	}
}

async function checkPreflightChecks(preflightChecks: preflightCheck[]) {
	let statusPromises = [];
	let remainingPromises = [];
	let remainingIndices = [];
	interface indexedCheckStatus {
		status: preflightStatus;
		index: number;
	}
	for (let checkIndex = 0; checkIndex < preflightChecks.length; checkIndex++) {
		let statusPromise: Promise<indexedCheckStatus> = preflightChecks[checkIndex].status().then(
			(status) => {
				return {'status': status, 'index': checkIndex};
			},
		);
		statusPromises.push(statusPromise);
		remainingPromises.push(statusPromise);
		remainingIndices.push(checkIndex);
	}
	let allStatusCodes = [];
	while (remainingIndices.length > 0) {
		let firstPromise: Promise<indexedCheckStatus> = Promise.race(remainingPromises);
		let promiseResponse = await firstPromise;
		let status = promiseResponse.status;
		remainingIndices = remainingIndices.filter(x => x !== promiseResponse.index);
		remainingPromises = [];
		for (let checkIndex of remainingIndices) {
			remainingPromises.push(statusPromises[checkIndex]);
		}
		status.check.reflectStatus(status);
		allStatusCodes.push(status.code);
	}

	// Compute overall status.
	let overallStatusCode = preflightCode.Done;
	for (let subStatusCode of allStatusCodes) {
		switch (subStatusCode) {
			case preflightCode.Loading:
				if (overallStatusCode == preflightCode.Done || overallStatusCode == preflightCode.NotDone) {
					overallStatusCode = preflightCode.Loading;
				}
				break;
			case preflightCode.Done:
				break;
			case preflightCode.NotDone:
				if (overallStatusCode == preflightCode.Done) {
					overallStatusCode = preflightCode.NotDone;
				}
				break;
			default:
				overallStatusCode = preflightCode.Failure;
				break;
		}
	}
	updateStatusImage($('#status-main'), overallStatusCode);
	let overallExplanation = $('#explanation-main');
	switch (overallStatusCode) {
		case preflightCode.Loading:
			overallExplanation.text('Checking if anything still needs to be configured...');
			break;
		case preflightCode.Done:
			overallExplanation.text('Good to go!');
			break;
		case preflightCode.NotDone:
			overallExplanation.text('A couple of preflight checks to address first.');
			break;
		default:
			overallExplanation.text('Cannot determine the state of the extension. Please report a bug.');
			break;
	}
	if (overallStatusCode == preflightCode.Done) {
		$('#ready-to-browse').show();
	} else {
		$('#ready-to-browse').hide();
	}
}

$(() => {
	$('.collapse-header').each((index: number, element: HTMLElement) => {
		$(element).click((() => {
			$($(element).find('[data-target]').attr('data-target')).collapse('toggle');
		}));
	});
	let preflightChecks = [
		new chainConfigs(),
	];
	let loopPheckPreflightChecks = () => {
		checkPreflightChecks(preflightChecks).then(() => {
			setTimeout(loopPheckPreflightChecks, 150);
		});
	};
	setTimeout(loopPheckPreflightChecks, 10);
});
