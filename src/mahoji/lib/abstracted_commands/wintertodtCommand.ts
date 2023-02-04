import { calcWhatPercent, reduceNumByPercent, Time } from 'e';
import { Bank } from 'oldschooljs';
import { SkillsEnum } from 'oldschooljs/dist/constants';

import { Eatables } from '../../../lib/data/eatables';
import { warmGear } from '../../../lib/data/filterables';
import { MinigameActivityTaskOptions } from '../../../lib/types/minions';
// import { formatDuration } from '../../../lib/util';
import addSubTaskToActivityTask from '../../../lib/util/addSubTaskToActivityTask';
import { calcMaxTripLength } from '../../../lib/util/calcMaxTripLength';
import { updateBankSetting } from '../../../lib/util/updateBankSetting';

export async function wintertodtCommand(user: MUser, channelID: string) {
	const fmLevel = user.skillLevel(SkillsEnum.Firemaking);
	const wcLevel = user.skillLevel(SkillsEnum.Woodcutting);
	if (fmLevel < 50) {
		return 'You need 50 Firemaking to have a chance at defeating the Wintertodt.';
	}

	const messages = [];

	let durationPerTodt = Time.Minute * 7.3;

	// Up to a 10% boost for 99 WC
	const wcBoost = (wcLevel + 1) / 10;
	if (wcBoost > 1) messages.push(`${wcBoost.toFixed(2)}% boost for Woodcutting level`);
	durationPerTodt = reduceNumByPercent(durationPerTodt, wcBoost);

	const baseHealAmountNeeded = 20 * 8;
	let healAmountNeeded = baseHealAmountNeeded;
	let warmGearAmount = 0;

	for (const piece of warmGear) {
		if (user.gear.skilling.hasEquipped([piece])) {
			warmGearAmount++;
		}
		if (warmGearAmount >= 4) break;
	}

	healAmountNeeded -= warmGearAmount * 15;
	durationPerTodt = reduceNumByPercent(durationPerTodt, 5 * warmGearAmount);

	if (healAmountNeeded !== baseHealAmountNeeded) {
		messages.push(
			`${calcWhatPercent(
				baseHealAmountNeeded - healAmountNeeded,
				baseHealAmountNeeded
			)}% less food for wearing warm gear`
		);
	}

	const quantity = Math.floor(calcMaxTripLength(user, 'Wintertodt') / durationPerTodt);

	for (const food of Eatables) {
		const healAmount = typeof food.healAmount === 'number' ? food.healAmount : food.healAmount(user);
		const amountNeeded = Math.ceil(healAmountNeeded / healAmount) * quantity;
		if (user.bank.amount(food.id) < amountNeeded) {
			if (Eatables.indexOf(food) === Eatables.length - 1) {
				return `You don't have enough food to do Wintertodt! You can use these food items: ${Eatables.map(
					i => i.name
				).join(', ')}.`;
			}
			continue;
		}

		messages.push(`Removed ${amountNeeded}x ${food.name}'s from your bank`);
		await user.removeItemsFromBank(new Bank().add(food.id, amountNeeded));

		// Track this food cost in Economy Stats
		await updateBankSetting('economyStats_wintertodtCost', new Bank().add(food.id, amountNeeded));

		break;
	}

	const duration = durationPerTodt * quantity;

	await addSubTaskToActivityTask<MinigameActivityTaskOptions>({
		minigameID: 'wintertodt',
		userID: user.id,
		channelID: channelID.toString(),
		quantity,
		duration,
		type: 'Wintertodt'
	});

	let appliedBoosts = applyBoosts(newBoosts, user);
	return `New calculated boost is ${appliedBoosts.multiplier}
	
${appliedBoosts.receivedBoostMessages.length > 0 ? `**Boosts:** ` + appliedBoosts.receivedBoostMessages.join(', ') : ''}
${appliedBoosts.missedBoostMessages.length > 0 ? `**Missed Boosts:** ` + appliedBoosts.missedBoostMessages.join(', ') : ''}
`;``

	// return `${user.minionName} is now off to kill Wintertodt ${quantity}x times, their trip will take ${formatDuration(
	// 	durationPerTodt * quantity
	// )}. (${formatDuration(durationPerTodt)} per todt)\n\n${messages.join(', ')}.`;
}

export function applyBoosts(boosts: any, user: MUser) {
	let receivedBoostMessages: string[] = [];
	let missedBoostMessages: string[] = [];
	let multiplier = 1;

	for(const boost of boosts.filter((i: { enabled: number; }) => i.enabled == 1)) {
		let actualBoost = Math.min(boost.ttkMultiplier().maxBoost, boost.ttkMultiplier().actual(user));

		if(actualBoost > 0) {
			receivedBoostMessages.push(`${actualBoost.toFixed(2)}% ${boost.desc()}`);
		}

		if(actualBoost < boost.ttkMultiplier().maxBoost) {
			missedBoostMessages.push(`${(boost.ttkMultiplier().maxBoost - actualBoost).toFixed(2)}% ${boost.desc()}`);
		}

		multiplier = reduceNumByPercent(multiplier, actualBoost);
	}

	return {
		multiplier: multiplier,
		receivedBoostMessages: receivedBoostMessages,
		missedBoostMessages: missedBoostMessages
	}
}

const newBoosts: {
	name: string;
	enabled: boolean,
	ttkMultiplier?: () => {
		minBoost: number,
		maxBoost: number,
		actual: (options: { 
			user: MUser;
		}) => number
	};
	desc: () => string;
}[] = [
	{
		name: 'Woodcutting Boost',
		enabled: true,
		ttkMultiplier: () => {
			return {
				minBoost: 0,
				maxBoost: 10,
				actual: (user) => {
					console.log(user.skillsAsLevels);

					return 5;
					//return ((user.skillsAsLevels.woodcutting + 1) / 10);
				}
			}
		},
		desc: () => {
			return "boost for Woodcutting level";
		}
	},
	{
		name: 'Warm Clothing',
		enabled: false,
		ttkMultiplier: () => {
			return {
				minBoost: 0,
				maxBoost: 20,
				actual: ({ user }) => {
					let warmGearAmount = 0;

					for (const piece of warmGear) {
						if (user.gear.skilling.hasEquipped([piece])) {
							warmGearAmount++;
						}
						if (warmGearAmount >= 4) break;
					}

					return warmGearAmount * 5;
				}
			}
		},
		desc: () => {
			return "boost for equipped Warm gear";
		}
	}
];