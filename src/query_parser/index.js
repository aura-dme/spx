import { chunkArray, stringMatch, isArray, isObject, getArray } from './../utility'
const IN_CHUNK_SIZE = 500;
const IN_CUSTOM_DELIMETER = '_DELIMITER_';
const GROUP_REGEXP_STR = '\\s(\&\&|\|\||and|or)\\s';
const GROUP_REGEXP = new RegExp(GROUP_REGEXP_STR, 'i');
const GROUP_BRACES_REGEXP = new RegExp('\\((.*' + GROUP_REGEXP_STR + '.*)\\)', 'i');
const TIME_STAMP_ISO_REGEXP = /^\d\d\d\d-\d\d-\d\dT\d\d\:\d\d\:\d\d(\.\d\d\d)?Z$/;
const COLUMN_TYPES = {
	AppAuthor: 'lookup',
	AppEditor: 'lookup',
	Attachments: 'attachments',
	Author: 'lookup',
	BaseName: 'computed',
	ContentType: 'computed',
	ContentTypeId: 'contentTypeId',
	Created: 'dateTime',
	Created_x0020_Date: 'lookup',
	DocIcon: 'computed',
	Edit: 'computed',
	Editor: 'lookup',
	EncodedAbsUrl: 'computed',
	FSObjType: 'number',
	FileDirRef: 'lookup',
	FileLeafRef: 'file',
	FileRef: 'file',
	File_x0020_Type: 'text',
	FolderChildCount: 'number',
	GUID: 'guid',
	HTML_x0020_Type: 'computed',
	ID: 'counter',
	InstanceID: 'integer',
	ItemChildCount: 'number',
	Last_x0020_Modified: 'lookup',
	LinkFilename: 'computed',
	LinkFilename2: 'computed',
	LinkFilenameNoMenu: 'computed',
	LinkTitle: 'computed',
	LinkTitle2: 'computed',
	LinkTitleNoMenu: 'computed',
	MetaInfo: 'lookup',
	Modified: 'dateTime',
	Order: 'number',
	PermMask: 'computed',
	ProgId: 'lookup',
	ScopeId: 'lookup',
	SelectTitle: 'computed',
	ServerUrl: 'computed',
	SortBehavior: 'lookup',
	SyncClientId: 'lookup',
	Title: 'text',
	UniqueId: 'lookup',
	WorkflowInstanceID: 'guid',
	WorkflowVersion: 'integer',
	_CopySource: 'text',
	_EditMenuTableEnd: 'computed',
	_EditMenuTableStart: 'computed',
	_EditMenuTableStart2: 'computed',
	_HasCopyDestinations: 'Boolean',
	_IsCurrentVersion: 'Boolean',
	_Level: 'integer',
	_ModerationComments: 'note',
	_ModerationStatus: 'modStat',
	_UIVersion: 'integer',
	_UIVersionString: 'text'
}
const COLUMN_TYPES_REGEXP = /(Text|Note|Number|Integer|Counter|Boolean|Lookup|User|DateTime|Date|Time|Computed|Currency|ModStat|Guid|File|Attachments|LookupMulti|UserMulti)\s/i;
const OPERATORS_REGEXP = /\s(eq|neq|geq|leq|gt|lt|isnull|isnotnull|contains|beginsWith|includes|notincludes|search|in)(\s|$)/i;
const COLUMN_TYPES_MAPPED = {
	text: 'Text',
	note: 'Text',
	number: 'Number',
	integer: 'Text',
	counter: 'Text',
	boolean: 'Text',
	lookup: 'Text',
	user: 'Text',
	datetime: 'Text',
	date: 'Text',
	time: 'Text',
	currency: 'Text',
	computed: 'Text',
	lookupmulti: 'Text',
	usermulti: 'Text',
	modstat: 'ModStat',
	guid: 'Guid',
	file: 'File',
	attachments: 'Attachments'
}
const OPERATORS_MAPPED = {
	eq: 'Eq',
	neq: 'Neq',
	geq: 'Geq',
	leq: 'Leq',
	gt: 'Gt',
	lt: 'Lt',
	isnull: 'IsNull',
	isnotnull: 'IsNotNull',
	beginswith: 'BeginsWith',
	contains: 'Contains',
	includes: 'Includes',
	notincludes: 'NotIncludes',
	search: 'Search',
	guid: 'Guid',
	file: 'File',
	attachments: 'Attachments',
	lookupmulti: 'LookupMulti',
	usermulti: 'UserMulti',
	search: 'Search',
	in: 'In'
}


const getStringFromOuterBraces = str => {
	const founds = str.match(new RegExp('^[^\\(]*\\((.*' + (GROUP_REGEXP.test(str) ? GROUP_REGEXP_STR + '.*' : '') + ')\\)[^\\)]*$', 'i'));
	return founds && founds[1] ? founds[1] : str
};

const trimBraces = (str = '') => {
	if (str[0] === '(' && str.substr(-1) === ')') {
		const openBracesCount = stringMatch(/\(/g)(str).length;
		if (openBracesCount !== stringMatch(/\)/g)(str).length) throw new Error('query has wrong braces');
		return openBracesCount >= stringMatch(new RegExp(GROUP_REGEXP_STR, 'ig'))(str).length
			? getStringFromOuterBraces(str)
			: str
	}
	return str
};

const convertExpression = str => {
	let operator, columnSplits, operatorMatch, fieldOption, includeTimeValue, type;
	let chunks = [];
	const valueStrings = [];
	let values = [];
	const valueChunks = [];
	const operatorMatches = str.match(OPERATORS_REGEXP);
	if (operatorMatches) {
		operatorMatch = operatorMatches[0];
		operator = operatorMatches[1].toLowerCase();
	} else {
		throw new SyntaxError(`Wrong operator in "${str}"`);
	}
	const strSplits = str.split(new RegExp(operatorMatch, 'i'));
	const columnStr = strSplits[0].replace(/\s\s+/g, ' ').trim();
	let name = columnStr;
	if (COLUMN_TYPES_REGEXP.test(columnStr)) {
		columnSplits = columnStr.split(' ');
		type = columnSplits.shift().toLowerCase();
		name = columnSplits.join(' ');
	} else {
		type = COLUMN_TYPES[name] || 'text';
	}
	let value = strSplits[1];
	if (/\#$/.test(name)) {
		name = name.substring(0, name.length - 1);
		fieldOption = 'LookupId="True"';
	}
	switch (type) {
		case 'datetime':
		case 'time':
		case 'date':
			includeTimeValue = 'StorageTZ="True"';
			if (type !== 'date') includeTimeValue += ' IncludeTimeValue="True"';
			type = 'datetime';
			value = new Date(value).toISOString()
			break;
		case 'text':
			if (TIME_STAMP_ISO_REGEXP.test(value)) includeTimeValue = 'StorageTZ="True"';
			break;
	}
	if (type !== 'text') value = value.trim();
	switch (operator) {
		case 'in':
			value = value.split(value.indexOf(IN_CUSTOM_DELIMETER) >= 0 ? IN_CUSTOM_DELIMETER : ',');
			break;
		case 'search':
			let searchQuery = 'ID isnull';
			const valueSplits = value.replace(/\s+/g, ' ').trim().split(' ');
			for (let split of valueSplits) searchQuery = `(${type} ${name} contains ${split} || ${searchQuery})`
			return convertGroupR(trimBraces(searchQuery));
	}
	const operatorNorm = OPERATORS_MAPPED[operator];
	const typeNorm = COLUMN_TYPES_MAPPED[type];
	const fieldOpts = fieldOption !== void 0 ? ` ${fieldOption}` : '';
	const valueOpts = includeTimeValue !== void 0 ? ` ${includeTimeValue}` : '';
	if (operator === 'in') {
		for (let valueItem of value) valueStrings.push(`<Value Type="${typeNorm}"${valueOpts}>${valueItem}</Value>`);
		if (value.length > IN_CHUNK_SIZE) {
			chunks = chunkArray(IN_CHUNK_SIZE)(valueStrings);
			for (let i = chunks.length - 1; i >= 0; i--) valueChunks.push(`<In><Values>${chunks[i].join('')}</Values></In>`);
			let itemsStr = '<IsNull><FieldRef Name="ID"/></IsNull>';
			for (let valueChunk of valueChunks) itemsStr = `<Or>${valueChunk}${itemsStr}</Or>`
			return values;
		} else {
			values = valueStrings.join('');
			return `<${operatorNorm}><FieldRef Name="${name}"${fieldOpts}/><Values>${values}</Values></${operatorNorm}>`;
		}
	} else {
		return `<${operatorNorm}><FieldRef Name="${name}"${fieldOpts}/>${/null/.test(operator) ? '' : `<Value Type="${typeNorm}"${valueOpts}>${value}</Value>`}</${operatorNorm}>`
	}
};

const convertGroupR = str => {
	let firstExpr, secondExpr, operator;
	let chars = '';
	let isBracesBefore = false;
	let isBracesAfter = false;
	let operatorIndex = 0;
	if (GROUP_BRACES_REGEXP.test(str)) {
		let groupIsOpen = 0;
		for (let i = 0; i < str.length; i++) {
			let char = str[i];
			if (char === '(') {
				if (!operatorIndex) isBracesBefore = true;
				groupIsOpen++;
				continue;
			};
			if (char === ')') {
				if (operatorIndex) isBracesAfter = true;
				groupIsOpen--;
				continue;
			};
			if (!groupIsOpen) {
				chars = chars.concat(char);
				if (!operatorIndex) operatorIndex = i;
			};
		}
	}
	if (chars && isBracesBefore && isBracesAfter) {
		operator = chars.trim();
		firstExpr = trimBraces(str.slice(0, operatorIndex));
		secondExpr = trimBraces(str.slice(operatorIndex + chars.length))
	} else {
		const matches = trimBraces(str).match(GROUP_BRACES_REGEXP);
		if (matches) {
			const dummyStr = '_dummy_';
			const dummyRE = new RegExp(dummyStr);
			const groupStr = matches[1];
			const dummySplits = str.replace(groupStr, dummyStr).split(GROUP_REGEXP);
			const dummySplit0 = dummySplits[0];
			if (dummySplits.length === 3) {
				operator = dummySplits[1];
				const dummySplit2 = dummySplits[2];
				if (dummyRE.test(dummySplit0)) {
					firstExpr = getStringFromOuterBraces(dummySplit0.replace(dummyStr, groupStr));
					secondExpr = dummySplit2;
				} else if (dummyRE.test(dummySplit2)) {
					firstExpr = dummySplit0;
					secondExpr = getStringFromOuterBraces(dummySplit2.replace(dummyStr, groupStr));
				}
			} else {
				return convertExpression(dummySplit0);
			}
		} else {
			const splits = str.split(GROUP_REGEXP);
			firstExpr = splits[0];
			if (splits.length === 3) {
				secondExpr = splits[2];
				operator = splits[1];
			} else {
				return convertExpression(firstExpr);
			}
		}
	}
	const operatorNorm = normalizeOperator(operator);
	return `<${operatorNorm}>${convertGroupR(firstExpr)}${convertGroupR(secondExpr)}</${operatorNorm}>`;
};

export const getCamlQuery = str => {
	if (!str) return '';
	if (isObject(str)) {
		return getCamlQuery(str);
	} else {
		const sanitaizedStr = trimBraces(str.replace(/^\s+/, ''));
		if (/^\<|\>$/.test(sanitaizedStr)) return str;
		return GROUP_REGEXP.test(sanitaizedStr) ? convertGroupR(sanitaizedStr) : convertExpression(sanitaizedStr)
	}
}

export const getCamlView = (opts = {}) => str => {
	let orderBys;
	let orderByStr = '';
	let limitStr = '';
	let scopeStr = '';
	const { OrderBy, Scope, Limit } = opts;
	if (OrderBy) {
		orderBys = getArray(OrderBy);
		for (let item of orderBys) {
			orderByStr += `<FieldRef Name="${item.split('>')[0]}"${/\>/.test(item) ? ' Ascending="FALSE"' : ''}/>`
		}
		orderByStr = `<OrderBy>${orderByStr}</OrderBy>`;
	}
	if (Scope) scopeStr = /allItems/i.test(Scope)
		? ' Scope="Recursive"' : /^items$/i.test(Scope)
			? ' Scope="FilesOnly"' : /^all$/i.test(Scope)
				? ' Scope="RecursiveAll"' : ''

	const queryStr = orderByStr
		? `<Query>${(str ? `<Where>${getCamlQuery(str)}</Where>${orderByStr}` : `${orderByStr}`)}</Query>` : str
			? `<Query><Where>${getCamlQuery(str)}</Where></Query>` : ''
	if (Limit) limitStr = `<RowLimit>${Limit}</RowLimit>`;
	return scopeStr || queryStr || limitStr ? `<View${scopeStr}>${queryStr + limitStr}</View>` : '';
}

export const joinQuery = (joiner = '||') => operator => value => items => {
	let query = normalizeOperator(joiner) === 'And' ? 'ID isnotnull' : 'ID isnull';
	if (!operator) operator = value === void 0 ? 'isnotnull' : 'eq';
	if (isArray(value)) {
		const valueLastIndex = value.length - 1;
		for (let i = items.length - 1; i >= 0; i--) {
			query = `(${items[i]} ${/null/i.test(operator) ? operator : `${operator} ${value[i] || value[valueLastIndex]}`} ${joiner} ${query})`
		}
	} else {
		for (let i = items.length - 1; i >= 0; i--) {
			query = `(${items[i]} ${/null/i.test(operator) ? operator : `${operator} ${value}`} ${joiner} ${query})`
		}
	}
	return trimBraces(query);
}

export const concatQuery = (joiner = '||') => ([query1, query2 = '']) => {
	const trimmed1 = trimBraces(query1);
	const trimmed2 = trimBraces(query2);
	if (!trimmed1) return query2;
	if (!trimmed2) return '';

	return GROUP_REGEXP.test(trimmed1) ?
		(GROUP_REGEXP.test(trimmed2) ? `(${trimmed1}) ${joiner} (${trimmed2})` : `(${trimmed1}) ${joiner} ${trimmed2}`) :
		(GROUP_REGEXP.test(trimmed2) ? `${trimmed1} ${joiner} (${trimmed2})` : `${trimmed1} ${joiner} ${trimmed2}`)
}

export const camlLog = str => console.log(str && DOMParser ? new DOMParser().parseFromString(str, 'text/xml') : str);

const normalizeOperator = operator => {
	const GROUP_OPERATORS_MAPPED = {
		'&&': 'And',
		'||': 'Or'
	}
	return GROUP_OPERATORS_MAPPED[operator] || (/^and$/i.test(operator) ? 'And' : 'Or');
}