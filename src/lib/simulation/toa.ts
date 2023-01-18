import { bold } from 'discord.js';
import {
	calcPercentOfNum,
	calcWhatPercent,
	increaseNumByPercent,
	objectEntries,
	percentChance,
	randArrItem,
	randInt,
	reduceNumByPercent,
	roll,
	round,
	sumArr,
	Time
} from 'e';
import { writeFileSync } from 'fs';
import { Bank, LootTable } from 'oldschooljs';
import SimpleTable from 'oldschooljs/dist/structures/SimpleTable';

import { mahojiParseNumber, userStatsBankUpdate } from '../../mahoji/mahojiSettings';
import { Emoji } from '../constants';
import { degradeItem } from '../degradeableItems';
import { GearStats, UserFullGearSetup } from '../gear/types';
import { trackLoot } from '../lootTrack';
import { setupParty } from '../party';
import { getMinigameScore } from '../settings/minigames';
import { SkillsEnum } from '../skilling/types';
import { constructGearSetup, Gear } from '../structures/Gear';
import { MakePartyOptions, Skills } from '../types';
import { TOAOptions } from '../types/minions';
import {
	assert,
	channelIsSendable,
	clamp,
	formatDuration,
	formatSkillRequirements,
	itemNameFromID,
	randomVariation
} from '../util';
import addSubTaskToActivityTask from '../util/addSubTaskToActivityTask';
import getOSItem from '../util/getOSItem';
import itemID from '../util/itemID';
import resolveItems from '../util/resolveItems';
import { updateBankSetting } from '../util/updateBankSetting';
import { TeamLoot } from './TeamLoot';

export const maxMageGear = constructGearSetup({
	head: 'Ancestral hat',
	neck: 'Occult necklace',
	body: 'Ancestral robe top',
	cape: 'Imbued saradomin cape',
	hands: 'Tormented bracelet',
	legs: 'Ancestral robe bottom',
	feet: 'Eternal boots',
	weapon: "Tumeken's shadow (uncharged)",
	shield: "Elidinis' ward (f)",
	ring: 'Lightbearer'
});
const maxMage = new Gear(maxMageGear);

export const maxRangeGear = constructGearSetup({
	head: 'Masori mask (f)',
	neck: 'Necklace of anguish',
	body: 'Masori body (f)',
	cape: "Ava's assembler",
	hands: 'Zaryte vambraces',
	legs: 'Masori chaps (f)',
	feet: 'Pegasian boots',
	'2h': 'Twisted bow',
	ring: 'Archers ring(i)',
	ammo: 'Dragon arrow'
});
const maxRange = new Gear(maxRangeGear);

export const maxMeleeLessThan300Gear = constructGearSetup({
	head: 'Torva full helm',
	neck: 'Amulet of torture',
	body: 'Torva platebody',
	cape: 'Infernal cape',
	hands: 'Ferocious gloves',
	legs: 'Torva platelegs',
	feet: 'Primordial boots',
	weapon: 'Ghrazi rapier',
	shield: 'Avernic defender',
	ring: 'Berserker ring(i)'
});
export const maxMeleeOver300Gear = constructGearSetup({
	head: 'Torva full helm',
	neck: 'Amulet of torture',
	body: 'Torva platebody',
	cape: 'Infernal cape',
	hands: 'Ferocious gloves',
	legs: 'Torva platelegs',
	feet: 'Primordial boots',
	weapon: "Osmumten's fang",
	shield: 'Avernic defender',
	ring: 'Berserker ring(i)'
});

const SERP_HELM_CHARGES_PER_HOUR = 600;
function calcSerpHelmCharges(time: number) {
	return Math.floor(time / (Time.Hour / SERP_HELM_CHARGES_PER_HOUR));
}
const REQUIRED_ARROWS = resolveItems(['Dragon arrow', 'Amethyst arrow', 'Rune arrow', 'Adamant arrow']);
// crossbows are spec boosts
// bow in range setup, boost if its a tbow
// u wouldnt take claws AND zcb tho btw,  one or the other, zcb being better
// bofa still slaps
const minTOAStats: Skills = {
	attack: 90,
	strength: 90,
	defence: 90,
	magic: 90,
	prayer: 90,
	ranged: 90
};
const minimumSuppliesNeeded = new Bank({
	'Saradomin brew(4)': 10,
	'Super restore(4)': 5,
	'Rune pouch': 1
});

const rangeWeaponBoosts = [['Twisted bow', 4]] as const;
const primarySpecWeaponBoosts = [
	['Dragon claws', 6],
	['Crystal halberd', 3]
] as const;
const secondarySpecWeaponBoosts = [
	['Dragon warhammer', 6],
	['Bandos godsword', 3],
	['Dragon dagger', 1]
] as const;
const REQUIRED_RANGE_WEAPONS = resolveItems(['Dragon crossbow', 'Armadyl crossbow', 'Zaryte crossbow']);
const MELEE_REQUIRED_WEAPONS = resolveItems(['Zamorakian hasta', 'Ghrazi rapier', "Osmumten's fang"]);
const MELEE_REQUIRED_ARMOR = resolveItems(['Fire cape', 'Infernal cape']);
const BP_DARTS_NEEDED = 150;
const BP_SCALES_NEEDED = 1000;
const BOW_ARROWS_NEEDED = 150;
const ALLOWED_DARTS = ['Adamant dart', 'Rune dart', 'Amethyst dart', 'Dragon dart'].map(getOSItem);
const toaRequirements: {
	name: string;
	doesMeet: (options: { user: MUser; gearStats: GearSetupPercents }) => string | true;
	desc: () => string;
}[] = [
	{
		name: 'Blowpipe',
		doesMeet: ({ user }) => {
			const blowpipeData = user.blowpipe;
			if (
				!user.owns('Toxic blowpipe') ||
				!blowpipeData.scales ||
				!blowpipeData.dartID ||
				!blowpipeData.dartQuantity
			) {
				return 'Needs Toxic blowpipe (with darts and scales equipped) in bank';
			}
			if (blowpipeData.dartQuantity < BP_DARTS_NEEDED) {
				return `Needs ${BP_DARTS_NEEDED}x darts`;
			}
			if (blowpipeData.scales < BP_SCALES_NEEDED) {
				return `Needs ${BP_SCALES_NEEDED}x scales`;
			}
			if (ALLOWED_DARTS.every(item => item.id !== blowpipeData.dartID)) {
				return 'Darts are too weak';
			}
			return true;
		},
		desc: () =>
			`atleast ${BP_DARTS_NEEDED}x darts and ${BP_SCALES_NEEDED} scales, and using one of: ${ALLOWED_DARTS.map(
				i => i.name
			).join(', ')}, loaded in Blowpipe`
	},
	{
		name: 'Range gear',
		doesMeet: ({ user, gearStats }) => {
			if (gearStats.range < 25) {
				return 'Terrible range gear';
			}

			if (!user.gear.range.hasEquipped(REQUIRED_RANGE_WEAPONS, false)) {
				return `Must have one of these equipped: ${REQUIRED_RANGE_WEAPONS.map(itemNameFromID).join(', ')}`;
			}

			const rangeAmmo = user.gear.range.ammo;

			if (!rangeAmmo || rangeAmmo.quantity < BOW_ARROWS_NEEDED) {
				return `Need ${BOW_ARROWS_NEEDED} arrows equipped`;
			}

			if (!REQUIRED_ARROWS.includes(rangeAmmo.item)) {
				return `Need one of these arrows equipped: ${REQUIRED_ARROWS.map(itemNameFromID).join(', ')}`;
			}

			return true;
		},
		desc: () =>
			`decent range gear (BiS is ${maxRangeGear.toString()}), atleast ${BOW_ARROWS_NEEDED}x arrows equipped, and one of these bows: ${REQUIRED_RANGE_WEAPONS.map(
				itemNameFromID
			).join(', ')}`
	},
	{
		name: 'Melee gear',
		doesMeet: ({ user, gearStats }) => {
			if (gearStats.melee < 25) {
				return 'Terrible melee gear';
			}

			if (!user.gear.melee.hasEquipped(MELEE_REQUIRED_WEAPONS, false)) {
				return `Need one of these weapons in your melee setup: ${MELEE_REQUIRED_WEAPONS.map(
					itemNameFromID
				).join(', ')}`;
			}
			if (!user.gear.melee.hasEquipped(MELEE_REQUIRED_ARMOR, false)) {
				return `Need one of these in your melee setup: ${MELEE_REQUIRED_WEAPONS.map(itemNameFromID).join(
					', '
				)}`;
			}

			return true;
		},
		desc: () =>
			`decent melee gear (BiS is ${maxMeleeLessThan300Gear.toString()}, switched to a Osmumten fang if the raid level is over 300), and one of these weapons: ${MELEE_REQUIRED_WEAPONS.map(
				itemNameFromID
			).join(', ')}, and one of these armor pieces: ${MELEE_REQUIRED_ARMOR.map(itemNameFromID).join(', ')}`
	},
	{
		name: 'Mage gear',
		doesMeet: ({ gearStats }) => {
			if (gearStats.mage < 25) {
				return 'Terrible mage gear';
			}

			return true;
		},
		desc: () => `decent mage gear (BiS is ${maxMageGear.toString()})`
	},
	{
		name: 'Stats',
		doesMeet: ({ user }) => {
			if (!user.hasSkillReqs(minTOAStats)) {
				return `You need: ${formatSkillRequirements(minTOAStats)}.`;
			}
			return true;
		},
		desc: () => `${formatSkillRequirements(minTOAStats)}`
	},
	{
		name: 'Supplies',
		doesMeet: ({ user }) => {
			if (!user.owns(minimumSuppliesNeeded)) {
				return `You need atleast this much supplies: ${minimumSuppliesNeeded}.`;
			}
			return true;
		},
		desc: () => `Need atleast ${minimumSuppliesNeeded}`
	},
	{
		name: 'Poison Protection',
		doesMeet: ({ user }) => {
			const ownsSanfew = user.owns('Sanfew serum(4)');
			const hasSerpHelm = user.gear.melee.hasEquipped('Serpentine helm', false);
			const hasSerpHelmCharges = user.user.serp_helm_charges >= calcSerpHelmCharges(Time.Hour);
			const canUseSerp = hasSerpHelm && hasSerpHelmCharges;

			if (!ownsSanfew && !canUseSerp) {
				return 'You need a charged Serpentine helmet equipped in melee, or a Sanfew serum(4) in your bank.';
			}
			return true;
		},
		desc: () => 'Need a charged Serpentine helmet equipped in melee, or a Sanfew serum(4) in your bank'
	}
];

interface BaseTOAUser {
	id: string;
}

interface TOAInputUser extends BaseTOAUser {
	gear: UserFullGearSetup;
	skills: Required<Skills>;
	totalKC: number;
	totalAttempts: number;
}

interface TOAParsedUser extends TOAInputUser {
	gearStats: GearSetupPercents;
	points: number;
	deaths: number[];
	user: MUser;
	totalEffectiveness: number;
}

const untradeables = [
	{
		item: getOSItem('Thread of elidinis'),
		dropRate: 10
	},
	{
		item: getOSItem('Eye of the corruptor'),
		dropRate: 60
	},
	{
		item: getOSItem('Jewel of the sun'),
		dropRate: 60
	},
	{
		item: getOSItem('Breach of the scarab'),
		dropRate: 60
	}
];

function untradeableRoll(kc: number, cl: Bank) {
	let loot = new Bank();
	for (const { item, dropRate } of untradeables) {
		let rolls = 1;
		if (!cl.has(item.id) && kc > 5) {
			rolls = Math.min(3, Math.floor(kc / 5));
		}
		for (let i = 0; i < rolls; i++) {
			if (roll(dropRate)) {
				loot.add(item.id);
				break;
			}
		}
	}
	return loot;
}

let TOAUniqueTable = new LootTable()
	.add('Lightbearer', 1, 7)
	.add("Osmumten's fang", 1, 7)
	.add("Elidinis' ward", 1, 3)
	.add('Masori mask', 1, 2)
	.add('Masori body', 1, 2)
	.add('Masori chaps', 1, 2)
	.add("Tumeken's shadow (uncharged)", 1, 1);

function uniqueLootRoll(kc: number, cl: Bank, raidLevel: number) {
	const [item] = TOAUniqueTable.roll().items()[0];

	if (resolveItems(["Osmumten's fang", 'Lightbearer']).includes(item.id) && raidLevel < 50 && !roll(50)) {
		return untradeableRoll(kc, cl);
	}

	if (
		resolveItems([
			"Elidinis' ward",
			'Masori mask',
			'Masori body',
			'Masori chaps',
			"Tumeken's shadow (uncharged)"
		]).includes(item.id) &&
		raidLevel < 150 &&
		!roll(50)
	) {
		return untradeableRoll(kc, cl);
	}

	return new Bank().add(item.id);
}

const nonUniqueTable = [
	['Coins', 1],
	['Death rune', 20],
	['Soul rune', 40],
	['Gold ore', 90],
	['Dragon dart tip', 100],
	['Mahogany logs', 180],
	['Sapphire', 200],
	['Emerald', 250],
	['Gold bar', 250],
	['Potato cactus', 250],
	['Raw shark', 250],
	['Ruby', 300],
	['Diamond', 400],
	['Raw manta ray', 450],
	['Cactus spine', 600],
	['Dragonstone', 600],
	['Battlestaff', 1100],
	['Coconut milk', 1100],
	['Lily of the sands', 1100],
	['Toadflax seed', 1400],
	['Ranarr seed', 1800],
	['Torstol seed', 2200],
	['Snapdragon seed', 2200],
	['Dragon med helm', 4000],
	['Magic seed', 6500],
	['Blood essence', 7500],
	['Cache of runes', null]
] as const;

function nonUniqueLoot({ points }: { points: number }) {
	assert(points >= 1 && points <= 60_000);
	let loot = new Bank();

	for (let i = 0; i < 3; i++) {
		const [item, divisor] = randArrItem(nonUniqueTable);
		loot.add(getOSItem(item).id, divisor === null ? 1 : Math.ceil(points / divisor));
	}

	return loot;
}

interface TOALootUser {
	id: string;
	points: number;
	cl: Bank;
	kc: number;
	deaths: number[];
}

export const toaOrnamentKits = [
	[getOSItem('Cursed phalanx'), 500],
	[getOSItem('Menaphite ornament kit'), 425],
	[getOSItem('Masori crafting kit'), 350]
] as const;

export const toaPetTransmogItems = resolveItems([
	'Remnant of zebak',
	'Ancient remnant',
	'Remnant of kephri',
	'Remnant of ba-ba',
	'Remnant of akkha'
]);

export function calcTOALoot({ users, raidLevel }: { users: TOALootUser[]; raidLevel: number }) {
	const uniqueDeciderTable = new SimpleTable();
	for (const user of users) uniqueDeciderTable.add(user.id, user.points);
	const loot = new TeamLoot();
	const totalTeamPoints = sumArr(users.map(i => i.points));

	// The number of raid levels less than or equal to 400
	let x = Math.min(raidLevel, 400);
	// The number of raid levels from 400 to 550
	let y = Math.min(150, raidLevel - 400);

	// prettier-ignore
	let pointsForOnePercentUniqueChance = 10_500 - 20 * (x + (y / 3));
	let chanceOfUnique = Math.min(totalTeamPoints / pointsForOnePercentUniqueChance, 55);
	let didGetUnique = percentChance(chanceOfUnique);
	const uniqueRecipient = didGetUnique ? uniqueDeciderTable.roll() : null;

	const messages: string[] = [`Your team had a ${chanceOfUnique.toFixed(2)}% chance of getting a unique drop.`];

	for (const user of users) {
		if (user.points < 1500) {
			loot.add(user.id, 'Fossilised dung');
			continue;
		}
		if (uniqueRecipient && user.id === uniqueRecipient) {
			loot.add(user.id, uniqueLootRoll(user.kc, user.cl, raidLevel));
		} else {
			loot.add(user.id, nonUniqueLoot({ points: user.points }));
		}
		loot.add(user.id, untradeableRoll(user.kc, user.cl));

		let pointsForOnePercentPetChance = 350_000 - 700 * (x + y / 3);
		let chanceOfPet = Math.min(user.points / pointsForOnePercentPetChance, 55);
		let didGetPet = percentChance(chanceOfPet);
		if (didGetPet) {
			loot.add(user.id, "Tumeken's guardian");
		}
	}

	const specialItemsReceived: number[] = [];
	const hadNoDeaths = users.every(u => u.deaths.length === 0);
	if (hadNoDeaths) {
		for (const kit of toaOrnamentKits.filter(i => raidLevel >= i[1])) {
			specialItemsReceived.push(kit[0].id);
			break;
		}
		if (raidLevel >= 450 && roll(3)) {
			specialItemsReceived.push(randArrItem(toaPetTransmogItems));
		}
		if (specialItemsReceived.length > 0) {
			for (const user of users) {
				for (const kit of specialItemsReceived) {
					loot.add(user.id, kit);
				}
			}
			messages.push(
				`You all received a ${specialItemsReceived
					.map(itemNameFromID)
					.join(', ')} for completing the raid without any deaths!`
			);
		}
	}

	return {
		teamLoot: loot,
		messages
	};
}

const TOARooms = [
	{
		id: 1,
		name: 'Akkha',
		difficulty: 1,
		timeWeighting: 1
	},
	{
		id: 2,
		name: 'Ba-Ba',
		difficulty: 1,
		timeWeighting: 1
	},
	{
		id: 3,
		name: 'Kephri',
		difficulty: 1,
		timeWeighting: 1
	},
	{
		id: 4,
		name: 'Zebak',
		difficulty: 1,
		timeWeighting: 1
	},
	{
		id: 5,
		name: 'Warden',
		difficulty: 3,
		timeWeighting: 2
	}
] as const;

export const mileStoneBaseDeathChances = [
	{ level: 600, chance: 40 },
	{ level: 500, chance: 33 },
	{ level: 400, chance: 29 },
	{ level: 350, chance: 25.5 },
	{ level: 300, chance: 20 },
	{ level: 200, chance: 15 },
	{ level: 100, chance: 10 },
	{ level: 1, chance: 5 }
] as const;

export type RaidLevel = typeof mileStoneBaseDeathChances[number]['level'];

function calcDeathChance(totalAttempts: number, raidLevel: RaidLevel) {
	let deathChance: number = mileStoneBaseDeathChances.find(i => i.level === raidLevel)!.chance;

	if (totalAttempts < 1) deathChance = increaseNumByPercent(deathChance, 99);
	else if (totalAttempts < 5) deathChance = increaseNumByPercent(deathChance, 75);
	else if (totalAttempts < 10) deathChance = increaseNumByPercent(deathChance, 55);
	else if (totalAttempts < 20) deathChance = increaseNumByPercent(deathChance, 25);
	else if (totalAttempts < 30) deathChance = increaseNumByPercent(deathChance, 15);
	else if (totalAttempts < 50) deathChance = increaseNumByPercent(deathChance, 5);

	// deathChance = Math.round(randomVariation(deathChance, 2.5));

	return deathChance;
}

let a = '';
a += ['Attempts', 'Raid Level', 'Death Chance'].join('\t');
for (const { level } of mileStoneBaseDeathChances) {
	for (const attempts of [0, 10, 20, 30, 50, 100, 500]) {
		a += '\n';
		a += [attempts, level, calcDeathChance(attempts, level)].join('\t');
	}
}
writeFileSync('./death-chances.txt', a);

function calculateTotalEffectiveness({
	totalAttempts,
	totalKC,
	gearStats,
	skillsAsLevels,
	randomNess
}: {
	totalKC: number;
	totalAttempts: number;
	gearStats: GearSetupPercents;
	skillsAsLevels: Skills;
	randomNess: boolean;
}) {
	let percents = [];

	// let kcWeighting = 2;
	// let attemptsWeighting = 1;
	// let statsWeighting = 2;
	// let skillsWeighting = 1.5;

	percents.push(clamp(calcWhatPercent(totalKC, 20), 0, 100));
	percents.push(clamp(calcWhatPercent(totalAttempts, 20), 0, 100));
	const skillsThatMatter = [SkillsEnum.Attack, SkillsEnum.Strength, SkillsEnum.Magic, SkillsEnum.Ranged];
	const totalSkills = objectEntries(skillsAsLevels)
		.filter(i => skillsThatMatter.includes(i[0]))
		.reduce((prev, curr) => prev + curr[1]!, 0);
	percents.push(calcWhatPercent(totalSkills, skillsThatMatter.length * 99));
	percents.push(gearStats.total);

	if (randomNess) {
		percents.push(randInt(50, 100));
	}

	return sumArr(percents) / percents.length;
}

function calculatePointsAndDeaths(effectiveness: number, totalAttempts: number, raidLevel: RaidLevel) {
	let points = 0;

	let deaths: number[] = [];
	let deathChance = calcDeathChance(totalAttempts, raidLevel);

	for (const room of TOARooms) {
		if (percentChance(deathChance / TOARooms.length)) {
			deaths.push(room.id);
		} else {
			points = randInt(1, calcPercentOfNum(effectiveness, 20_000));
		}
	}

	points = clamp(points, 1, 64_000);

	return {
		points,
		deaths
	};
}

function calcSetupPercent(
	maxStats: GearStats,
	userStats: GearStats,
	heavyPenalizeStat: keyof GearStats,
	ignoreStats: (keyof GearStats)[],
	melee: boolean
) {
	let numKeys = 0;
	let totalPercent = 0;
	for (const [key, val] of Object.entries(maxStats) as [keyof GearStats, number][]) {
		if (val <= 0 || ignoreStats.includes(key)) continue;
		const rawPercent = Math.min(100, calcWhatPercent(userStats[key], val));
		totalPercent += rawPercent;
		numKeys++;
	}
	// For melee compare the highest melee attack stat of max setup with the highest melee attack stat of the user
	if (melee) {
		let maxMeleeStat = Math.max(
			maxStats['attack_stab'],
			Math.max(maxStats['attack_slash'], maxStats['attack_crush'])
		);
		let userMeleeStat = Math.max(
			userStats['attack_stab'],
			Math.max(userStats['attack_slash'], userStats['attack_crush'])
		);
		totalPercent += Math.min(100, calcWhatPercent(userMeleeStat, maxMeleeStat));
		numKeys++;
	}
	totalPercent /= numKeys;
	// Heavy penalize for having less than 50% in the main stat of this setup.
	if (userStats[heavyPenalizeStat] < maxStats[heavyPenalizeStat] / 2) {
		totalPercent = Math.floor(Math.max(0, totalPercent / 2));
	}
	return totalPercent;
}

interface GearSetupPercents {
	melee: number;
	range: number;
	mage: number;
	total: number;
}
export function calculateUserGearPercents(gear: UserFullGearSetup, raidLevel: number): GearSetupPercents {
	const maxMelee = raidLevel < 300 ? maxMeleeLessThan300Gear : maxMeleeOver300Gear;
	const melee = calcSetupPercent(
		maxMelee.stats,
		gear.melee.stats,
		'melee_strength',
		['attack_stab', 'attack_slash', 'attack_crush', 'attack_ranged', 'attack_magic'],
		true
	);
	const range = calcSetupPercent(
		maxRange.stats,
		gear.range.stats,
		'ranged_strength',
		['attack_stab', 'attack_slash', 'attack_crush', 'attack_magic'],
		false
	);
	const mage = calcSetupPercent(
		maxMage.stats,
		gear.mage.stats,
		'magic_damage',
		['attack_stab', 'attack_slash', 'attack_crush', 'attack_ranged'],
		false
	);
	return {
		melee,
		range,
		mage,
		total: (melee + range + mage) / 3
	};
}
// 450rl+ with Sun Keris = 10 Super Restores, no brews
// 50x Dragon arrows, scaling to more as weaker used.
// 40x Dragon darts, same as above with arrows.
// 200x Sang charges.
// 150x Shadow charges.
// 100x Blood fury charges.
export async function calcTOAInput({
	user,
	kcOverride,
	duration
}: {
	user: MUser;
	kcOverride?: number;
	duration: number;
}): Promise<{
	cost: Bank;
	serpHelmCharges: number;
	blowpipeCost: Bank;
}> {
	const cost = new Bank();
	const kc = kcOverride ?? (await getMinigameScore(user.id, 'tombs_of_amascut'));
	cost.add('Super combat potion(4)', 1);
	cost.add('Ranging potion(4)', 1);

	let serpHelmCharges = 0;

	if (!user.gear.melee.hasEquipped('Serpentine helm')) {
		cost.add('Sanfew serum(4)', 1);
	} else {
		serpHelmCharges = calcSerpHelmCharges(duration);
	}

	// Between 8-1 brews
	let brewsNeeded = Math.max(1, 9 - Math.max(1, Math.ceil((kc + 1) / 12)));
	const restoresNeeded = Math.max(2, Math.floor(brewsNeeded / 3));

	cost.add('Saradomin brew(4)', brewsNeeded);
	cost.add('Super restore(4)', restoresNeeded);

	cost.add('Blood rune', 110);
	cost.add('Death rune', 100);
	cost.add('Water rune', 800);

	const { blowpipe } = user;
	const dartID = blowpipe.dartID ?? itemID('Rune dart');
	const dartQuantity = blowpipe.dartQuantity ?? BP_DARTS_NEEDED;
	const blowpipeCost = new Bank();
	blowpipeCost.add(dartID, Math.floor(Math.min(dartQuantity, BP_DARTS_NEEDED)));
	blowpipeCost.add(user.gear.range.ammo!.item, BOW_ARROWS_NEEDED);

	return {
		cost,
		serpHelmCharges,
		blowpipeCost
	};
}

export async function checkTOAUser(
	user: MUser,
	kc: number,
	raidLevel: number,
	teamSize: number,
	duration: number
): Promise<[false] | [true, string]> {
	if (!user.hasMinion) {
		return [true, `${user.usernameOrMention} doesn't have a minion`];
	}

	const setupPercents = calculateUserGearPercents(user.gear, raidLevel);
	const reqResults = toaRequirements.map(i => ({ ...i, result: i.doesMeet({ user, gearStats: setupPercents }) }));
	const unmetReqs = reqResults.filter(i => typeof i.result === 'string');
	if (unmetReqs.length > 0) {
		return [
			true,
			`${user.usernameOrMention} doesn't meet the requirements: ${unmetReqs.map(i => i.result).join(', ')}`
		];
	}

	const { cost, serpHelmCharges } = await calcTOAInput({ user, duration });
	if (!user.owns(cost)) {
		return [true, `${user.usernameOrMention} doesn't own the required supplies: ${cost.remove(user.bankWithGP)}`];
	}

	if (user.user.serp_helm_charges < serpHelmCharges) {
		return [
			true,
			`${
				user.usernameOrMention
			} doesn't have enough Serpentine helm charges. You need atleast ${serpHelmCharges} charges to do a ${formatDuration(
				duration
			)} TOA raid.`
		];
	}

	if (teamSize < 3 && raidLevel > 200) {
		let dividedRaidLevel = raidLevel / 10;
		if (teamSize === 2) dividedRaidLevel /= 2;
		if (kc < dividedRaidLevel) {
			return [
				true,
				`${user.usernameOrMention}, you need atleast ${dividedRaidLevel} TOA KC to ${
					teamSize === 2 ? 'duo' : 'solo'
				} a level ${raidLevel} TOA raid.`
			];
		}
	}

	return [false];
}

export async function checkTOATeam(users: MUser[], raidLevel: number): Promise<string | null> {
	const userWithoutSupplies = users.find(u => !u.bank.has(minimumSuppliesNeeded));
	if (userWithoutSupplies) {
		return `${userWithoutSupplies.usernameOrMention} doesn't have enough supplies`;
	}
	if (users.length < 1 || users.length > 8) {
		return 'TOA team must be 1-8 users';
	}

	for (const user of users) {
		if (user.minionIsBusy) return `${user.usernameOrMention}'s minion is busy.`;
		const checkResult = await checkTOAUser(
			user,
			await getMinigameScore(user.id, 'tombs_of_amascut'),
			raidLevel,
			users.length,
			Time.Hour
		);
		if (!checkResult[0]) {
			continue;
		} else {
			return checkResult[1];
		}
	}

	return null;
}

export async function toaStartCommand(
	user: MUser,
	solo: boolean,
	channelID: string,
	raidLevel: RaidLevel,
	teamSize?: number
) {
	if (user.minionIsBusy) {
		return `${user.usernameOrMention} minion is busy`;
	}

	const initialCheck = await checkTOAUser(
		user,
		await getMinigameScore(user.id, 'tombs_of_amascut'),
		raidLevel,
		solo ? 1 : teamSize ?? 5,
		Time.Hour
	);
	if (initialCheck[0]) {
		return initialCheck[1];
	}

	if (user.minionIsBusy) {
		return "Your minion is busy, so you can't start a raid.";
	}

	let maxSize = mahojiParseNumber({ input: teamSize, min: 2, max: 5 }) ?? 5;

	const partyOptions: MakePartyOptions = {
		leader: user,
		minSize: 1,
		maxSize,
		ironmanAllowed: true,
		message: `${user.usernameOrMention} is hosting a Tombs of Amascut mass! Use the buttons below to join/leave.`,
		customDenier: async user => {
			if (user.minionIsBusy) {
				return [true, `${user.usernameOrMention} minion is busy`];
			}

			return checkTOAUser(user, 0, 200, 5, Time.Hour);
		}
	};

	const channel = globalClient.channels.cache.get(channelID.toString());
	if (!channelIsSendable(channel)) return 'No channel found.';
	let usersWhoConfirmed = [];
	try {
		usersWhoConfirmed = solo ? [user] : await setupParty(channel, user, partyOptions);
	} catch (err: any) {
		return {
			content: typeof err === 'string' ? err : 'Your mass failed to start.',
			ephemeral: true
		};
	}
	const users = usersWhoConfirmed.filter(u => !u.minionIsBusy).slice(0, maxSize);

	const teamCheckFailure = await checkTOATeam(users, raidLevel);
	if (teamCheckFailure) {
		return `Your mass failed to start because of this reason: ${teamCheckFailure} ${users}`;
	}

	const {
		duration,
		totalReduction,
		reductions,
		wipedRoom: _wipedRoom,
		deathDuration,
		parsedTeam
	} = await createTOATeam({
		team: users,
		raidLevel
	});
	const wipedRoom = _wipedRoom ? TOARooms.find(room => _wipedRoom === room.id)! : null;
	let debugStr = '';

	const totalCost = new Bank();

	const costResult = await Promise.all(
		users.map(async u => {
			const { cost, blowpipeCost } = await calcTOAInput({ user: u, duration });
			const { realCost } = await u.specialRemoveItems(cost.clone().add(blowpipeCost));
			if (u.gear.melee.hasEquipped('Serpentine helm')) {
				await degradeItem({
					item: getOSItem('Serpentine helm'),
					chargesToDegrade: calcSerpHelmCharges(duration),
					user: u
				});
			}
			await userStatsBankUpdate(u.id, 'toa_cost', realCost);
			const effectiveCost = realCost.clone();
			totalCost.add(effectiveCost);

			const { total } = calculateUserGearPercents(u.gear, raidLevel);
			debugStr += `**- ${u.usernameOrMention}** (${Emoji.Gear}${total.toFixed(1)}% ${
				Emoji.CombatSword
			} ${calcWhatPercent(reductions[u.id], totalReduction).toFixed(1)}%) used ${realCost}\n\n`;
			return {
				userID: u.id,
				effectiveCost
			};
		})
	);

	updateBankSetting('toa_cost', totalCost);
	await trackLoot({
		totalCost,
		id: 'tombs_of_amascut',
		type: 'Minigame',
		changeType: 'cost',
		users: costResult.map(i => ({
			id: i.userID,
			cost: i.effectiveCost,
			duration
		}))
	});

	let userArr: TOAOptions['users'] = [];
	for (const user of parsedTeam) {
		userArr.push([user.id, [user.points], [user.deaths]]);
	}

	await addSubTaskToActivityTask<TOAOptions>({
		userID: user.id,
		channelID: channelID.toString(),
		duration: deathDuration ?? duration,
		type: 'TombsOfAmascut',
		leader: user.id,
		users: userArr,
		wipedRoom: wipedRoom === null ? null : wipedRoom.id,
		fakeDuration: duration,
		raidLevel,
		quantity: 1
	});

	let str = `${partyOptions.leader.usernameOrMention}'s party (${users
		.map(u => u.usernameOrMention)
		.join(', ')}) is now off to do a Tombs of Amascut raid - the total trip will take ${formatDuration(duration)}.`;

	str += ` \n\n${debugStr}`;

	return str;
}

const speedReductionForGear = 16;
const speedReductionForKC = 40;
const totalSpeedReductions = speedReductionForGear + speedReductionForKC + 15 + 4;
let baseTOADurations: Record<RaidLevel, number> = {
	1: Time.Minute * 50,
	100: Time.Minute * 50,
	200: Time.Minute * 65,
	300: Time.Minute * 70,
	350: Time.Minute * 75,
	400: Time.Minute * 80,
	500: Time.Minute * 90,
	600: Time.Minute * 100
};

const { ceil } = Math;
function calcPerc(perc: number, num: number) {
	return ceil(calcPercentOfNum(ceil(perc), num));
}

function kcEffectiveness(normalKC: number) {
	const kc = normalKC;
	let cap = 400;
	const kcEffectiveness = Math.min(100, calcWhatPercent(kc, cap));
	return kcEffectiveness;
}

interface ParsedTeamMember {
	id: string;
	kc: number;
	deaths: number[];
	points: number;
	attempts: number;
}

export async function createTOATeam({
	team,
	disableVariation,
	raidLevel
}: {
	raidLevel: RaidLevel;
	team: MUser[];
	disableVariation?: true;
}) {
	let arr: TOAParsedUser[] = [];

	for (const user of team) {
		let gearStats = calculateUserGearPercents(user.gear, raidLevel);
		const totalAttempts = (await user.fetchStats()).toa_attempts;
		const totalKC = await getMinigameScore(user.id, 'tombs_of_amascut');
		const effectiveness = calculateTotalEffectiveness({
			totalAttempts,
			totalKC,
			skillsAsLevels: user.skillsAsLevels,
			gearStats,
			randomNess: true
		});
		const { points, deaths } = calculatePointsAndDeaths(effectiveness, totalAttempts, raidLevel);
		arr.push({
			id: user.id,
			gearStats,
			points,
			deaths,
			user,
			gear: user.gear,
			totalAttempts,
			totalKC,
			skills: user.getSkills(true),
			totalEffectiveness: effectiveness
		});
	}
	const teamSize = team.length;
	const maxScaling = 350;
	assert(teamSize >= 1 && teamSize < 9, 'TOA team must be 1-8 users');

	let individualReductions = [];

	let reductions: Record<string, number> = {};

	let parsedTeam: ParsedTeamMember[] = [];

	for (const u of arr) {
		let userPercentChange = 0;

		// Reduce time for gear
		const gearPerecents = calculateUserGearPercents(u.user.gear, raidLevel);
		// Blowpipe
		userPercentChange += calcPerc(gearPerecents.total, speedReductionForGear);

		// Reduce time for KC
		const kcPercent = kcEffectiveness(Math.min(u.totalAttempts, maxScaling));
		userPercentChange += calcPerc(kcPercent, speedReductionForKC);

		const maxKcCurveBonus = 30;
		const durationCurveModifier = Math.min(maxKcCurveBonus, kcPercent * 0.6);
		userPercentChange *= 1 + durationCurveModifier / 100;

		/**
		 *
		 * Item/Gear Boosts
		 *
		 */

		let weaponBoosts: string[] = ["Osmumten's fang", 'Ghrazi rapier'];
		let boostAmounts = [15, 6] as const;

		// If the raid level is less than 300, Ghrazi rapier is the BIS instead.
		if (raidLevel < 300) weaponBoosts = [weaponBoosts[1], weaponBoosts[0]];
		for (let i = 0; i < weaponBoosts.length; i++) {
			let amount = boostAmounts[i];
			if (u.gear.melee.hasEquipped(weaponBoosts[i])) {
				userPercentChange += amount;
				break;
			}
		}

		for (const [name, percent] of rangeWeaponBoosts) {
			if (u.gear.range.hasEquipped(name)) {
				userPercentChange += percent;
				break;
			}
		}

		for (const [name, percent] of primarySpecWeaponBoosts) {
			if (u.user.hasEquippedOrInBank(name)) {
				userPercentChange += percent;
				break;
			}
		}

		for (const [name, percent] of secondarySpecWeaponBoosts) {
			if (u.user.hasEquippedOrInBank(name)) {
				userPercentChange += percent;
				break;
			}
		}

		let reduction = round(userPercentChange / teamSize, 1);

		individualReductions.push(userPercentChange);
		reductions[u.user.id] = reduction;

		parsedTeam.push({
			id: u.id,
			kc: u.totalKC,
			deaths: u.deaths,
			points: u.points,
			attempts: u.totalAttempts
		});
	}
	let duration = baseTOADurations[raidLevel];

	if (raidLevel > 100) {
		duration += (raidLevel / 100) * Time.Minute;
	}

	// Get the sum of individualReductions array
	let totalReduction = individualReductions.reduce((a, c) => a + c);

	// Remove the worst player from speed calculation if team size > 2:
	if (teamSize > 2) {
		totalReduction -= Math.min(...individualReductions);
		totalReduction = round(totalReduction / (teamSize - 1), 2);
	} else {
		totalReduction = round(totalReduction / teamSize, 2);
	}

	duration = reduceNumByPercent(duration, totalReduction);

	if (duration < Time.Minute * 20) {
		duration = Math.max(Time.Minute * 20, duration);
	}

	if (team.length < 5) {
		duration += (5 - team.length) * (Time.Minute * 1.3);
	}

	duration = Math.floor(randomVariation(duration, 5));

	let wipedRoom: number | null = null;
	let deathDuration: number | null = 0;

	for (const room of TOARooms) {
		if (arr.every(u => u.deaths.includes(room.id))) {
			wipedRoom = room.id;
		}
	}

	for (let i = 0; i < TOARooms.length; i++) {
		let room = TOARooms[i];

		if (parsedTeam.every(member => member.deaths.includes(i))) {
			wipedRoom = room.id;
			deathDuration += Math.floor(
				calcPercentOfNum(disableVariation ? room.timeWeighting / 2 : randInt(1, room.timeWeighting), duration)
			);
			break;
		} else {
			deathDuration += Math.floor(calcPercentOfNum(room.timeWeighting, duration));
		}
	}

	if (!wipedRoom) deathDuration = null;

	if (wipedRoom !== null && !TOARooms.some(room => room.id === wipedRoom)) {
		wipedRoom = null;
	}

	return {
		duration,
		reductions,
		totalReduction: totalSpeedReductions / teamSize,
		parsedTeam,
		wipedRoom,
		deathDuration
	};
}

export async function toaCheckCommand(user: MUser) {
	const result = await checkTOAUser(user, await getMinigameScore(user.id, 'tombs_of_amascut'), 200, 5, Time.Hour);
	if (result[0]) {
		return `You aren't able to join a Tombs of Amascut raid, address these issues first: ${result[1]}`;
	}
	return 'You are ready to do the Tombs of Amascut!';
}

export async function toaStatsCommand(user: MUser) {
	const minigameScore = await getMinigameScore(user.id, 'tombs_of_amascut');
	const stats = await user.fetchStats();

	let totalUniques = 0;
	for (const item of TOAUniqueTable.allItems) {
		totalUniques += user.cl.amount(item);
	}

	const gear = calculateUserGearPercents(user.gear, 300);

	return `**Tombs of Amascut**
**Attempts:** ${stats.toa_attempts}
**KC:** ${minigameScore} KC
**Total Uniques:** ${totalUniques} ${
		totalUniques > 0
			? `(1 unique per ${Math.floor(
					stats.total_toa_points / totalUniques
			  ).toLocaleString()} pts, one unique every ${Math.floor(minigameScore / totalUniques)} raids)`
			: ''
	}
**Melee:** ${gear.melee.toFixed(1)}%
**Range:** ${gear.range.toFixed(1)}%
**Mage:** ${gear.mage.toFixed(1)}%
**Total Gear Score:** ${Emoji.Gear} ${gear.total.toFixed(1)}%
`;
}

export async function toaHelpCommand(user: MUser) {
	const gearStats = calculateUserGearPercents(user.gear, 300);
	let str = `**Tombs of Amascut**

**Ready:** ${await toaCheckCommand(user)}

**Requirements**
${toaRequirements
	.map(i => {
		let res = i.doesMeet({ user, gearStats });
		if (typeof res === 'string') {
			return `- ❌ ${bold(i.name)} ${res}`;
		}

		return `- ✅ ${bold(i.name)}`;
	})
	.join('\n')}
`;

	return str;
}
