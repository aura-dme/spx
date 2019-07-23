/* eslint class-methods-use-this:0 */
import axios from 'axios'
import {
	ACTION_TYPES,
	CACHE_RETRIES_LIMIT,
	LIBRARY_STANDART_COLUMN_NAMES,
	AbstractBox,
	getInstance,
	methodEmpty,
	prepareResponseJSOM,
	getClientContext,
	load,
	executorJSOM,
	convertFileContent,
	setFields,
	hasUrlTailSlash,
	isArray,
	mergeSlashes,
	getFolderFromUrl,
	getFilenameFromUrl,
	executorREST,
	prepareResponseREST,
	isExists,
	getSPFolderByUrl,
	popSlash,
	identity,
	getInstanceEmpty,
	executeJSOM,
	isObject,
	typeOf,
	setItem,
	ifThen,
	join,
	getListRelativeUrl,
	listReport,
	switchCase,
	shiftSlash,
	isArrayFilled,
	pipe,
	map,
	removeEmptyUrls,
	removeDuplicatedUrls,
	constant,
	stringTest,
	isUndefined,
	isBlob,
	hasUrlFilename,
	removeEmptyFilenames,
	isObjectFilled,
	isNumberFilled,
	deep1Iterator,
	deep1IteratorREST,
	getRequestDigest
} from '../lib/utility'
import * as cache from '../lib/cache'

const copyOrMove = async (isMove, opts = {}) => {
	const { contextUrl, listUrl } = this
	await this.iteratorREST(async ({ element }) => {
		const { To, OnlyContent } = element
		const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
		if (!hasUrlFilename(elementUrl)) return
		let targetWebUrl; let targetListUrl; let
			targetFileUrl
		if (isObject(To)) {
			targetWebUrl = To.WebUrl
			targetListUrl = To.ListUrl
			targetFileUrl = getListRelativeUrl(To.WebUrl)(To.ListUrl)(To) || ''
		} else {
			targetWebUrl = contextUrl
			targetListUrl = listUrl
			targetFileUrl = To
		}
		if (!targetWebUrl) throw new Error('Target WebUrl is missed')
		if (!targetListUrl) throw new Error('Target ListUrl is missed')
		if (!elementUrl) throw new Error('Source file Url is missed')
		const spxSourceList = this.parent.of(listUrl)
		const spxSourceFile = spxSourceList.file(elementUrl)
		const spxTargetList = this.parent.parent.of(targetWebUrl).library(targetListUrl)
		const fullTargetFileUrl = hasUrlFilename(targetFileUrl)
			? targetFileUrl
			: `${targetFileUrl}/${getFilenameFromUrl(elementUrl)}`
		const columnsToUpdate = {}
		const existedColumnsToUpdate = {}
		if (!OnlyContent) {
			const sourceFileData = await spxSourceFile.get({ asItem: true })
			const keys = Reflect.ownKeys(sourceFileData)
			for (let i = 0; i < keys.length; i += 1) {
				const columnName = keys[i]
				if (!LIBRARY_STANDART_COLUMN_NAMES[columnName] && sourceFileData[columnName] !== null) {
					columnsToUpdate[columnName] = sourceFileData[columnName]
				}
			}
			if (Object.keys(columnsToUpdate).length) {
				const columnKeys = Reflect.ownKeys(columnsToUpdate)
				for (let i = 0; i < columnKeys.length; i += 1) {
					const columnName = columnKeys[i]
					existedColumnsToUpdate[columnName] = sourceFileData[columnName]
				}
			}
		}
		if (!opts.forced && contextUrl === targetWebUrl) {
			const clientContext = getClientContext(contextUrl)
			const listSPObject = this.getListSPObject(listUrl, this.getContextSPObject(clientContext))
			const spObject = this.getSPObject(elementUrl, listSPObject)
			const folder = getFolderFromUrl(targetFileUrl)
			if (folder) {
				await this
					.parent
					.folder(folder)
					.create({ silentInfo: true, expanded: true, view: ['Name'] })
					.catch(identity)
			}
			spObject[isMove ? 'moveTo' : 'copyTo'](mergeSlashes(`${targetListUrl}/${fullTargetFileUrl}`))
			await executeJSOM(clientContext)(spObject)(opts)
			await spxTargetList
				.file({ Url: targetFileUrl, Columns: existedColumnsToUpdate })
				.update({ silentInfo: true })
		} else {
			await spxTargetList
				.file({
					Url: fullTargetFileUrl,
					Content: await spxSourceList.file(elementUrl).get({ asBlob: true }),
					OnProgress: element.OnProgress,
					Overwrite: element.Overwrite,
					Columns: existedColumnsToUpdate
				})
				.create({ silentInfo: true })
			if (isMove) await spxSourceFile.delete()
		}
	})

	console.log(`${ACTION_TYPES[isMove ? 'move' : 'copy']} ${this.box.getCount()} ${this.name}(s)`)
}

const liftFolderType = switchCase(typeOf)({
	object: context => {
		const newContext = Object.assign({}, context)
		const name = context.Content ? context.Content.name : undefined
		if (!context.Url) newContext.Url = context.ServerRelativeUrl || context.FileRef || name
		if (!context.ServerRelativeUrl) newContext.ServerRelativeUrl = context.Url || context.FileRef
		return newContext
	},
	string: (contextUrl = '') => {
		const url = contextUrl === '/' ? '/' : shiftSlash(mergeSlashes(contextUrl))
		return {
			Url: url,
			ServerRelativeUrl: url
		}
	},
	default: () => ({
		Url: '',
		ServerRelativeUrl: ''
	})
})

const createUnexistedFolder = async () => {
	const foldersToCreate = {}
	await this.iteratorREST(({ element }) => {
		foldersToCreate[element.Folder || getFolderFromUrl(element.Url)] = true
	})

	return this
		.parent
		.folder(Object.keys(foldersToCreate))
		.create({ silentInfo: true, expanded: true, view: ['Name'] })
		.then(() => {
			const cacheUrl = ['fileCreationRetries', this.parent.parent.id]
			const retries = cache.get(cacheUrl)
			if (retries) {
				cache.set(retries - 1)(cacheUrl)
				return true
			}
			return false
		})
		.catch(err => {
			if (/already exists/.test(err.get_message())) return true
			return false
		})
}

const createWithJSOM = async (opts = {}) => {
	let needToRetry
	let isError
	const { contextUrl, listUrl } = this
	const options = opts.asItem ? { ...opts, view: ['ListItemAllFields'] } : { ...opts }

	const { clientContexts, result } = await this.iterator(({ clientContext, element }) => {
		const { Content = '', Columns = {}, Overwrite = true } = element
		const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
		if (!hasUrlFilename(elementUrl)) return undefined
		const contextSPObject = this.getContextSPObject(clientContext)
		const listSPObject = this.getListSPObject(listUrl)(contextSPObject)
		const spObjects = this.getSPObjectCollection(elementUrl)(listSPObject)
		const fileCreationInfo = getInstanceEmpty(SP.FileCreationInformation)
		setFields({
			set_url: `/${contextUrl}/${listUrl}/${elementUrl}`,
			set_content: '',
			set_overwrite: Overwrite
		})(fileCreationInfo)
		const spObject = spObjects.add(fileCreationInfo)
		const fieldsToCreate = {}
		if (isObjectFilled(Columns)) {
			const props = Reflect.ownKeys(Columns)
			for (let i = 0; i < props.length; i += 1) {
				const prop = props[i]
				const fieldName = Columns[prop]
				const field = Columns[fieldName]
				fieldsToCreate[fieldName] = ifThen(isArray)([join(';#;#')])(field)
			}
		}
		const binaryInfo = getInstanceEmpty(SP.FileSaveBinaryInformation)
		setFields({
			set_content: convertFileContent(Content),
			set_fieldValues: fieldsToCreate
		})(binaryInfo)
		spObject.saveBinary(binaryInfo)
		return load(clientContext)(spObject)(options)
	})
	if (this.box.getCount()) {
		for (let i = 0; i < clientContexts.length; i += 1) {
			const clientContext = clientContexts[i]
			await executorJSOM(clientContext)({ ...options, silentErrors: true }).catch(async () => {
				isError = true
				needToRetry = await createUnexistedFolder.call(this)
			})
			if (needToRetry) break
		}
	}
	if (needToRetry) {
		return createWithJSOM(options)
	}
	if (isError) {
		throw new Error('can\'t create file(s)')
	} else {
		this.report('create', options)
		return prepareResponseJSOM(options)(result)
	}
}

const createWithRESTFromString = async (element, opts = {}) => {
	let needToRetry
	let isError
	const { needResponse } = opts
	const { Content = '', Overwrite = true, Columns } = element
	const { contextUrl, listUrl } = this
	const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
	const filename = getFilenameFromUrl(elementUrl)
	const filesUrl = this.getRESTObjectCollection(elementUrl, listUrl, contextUrl)
	await axios({
		url: `${filesUrl}/add(url='${filename}',overwrite=${Overwrite})`,
		headers: {
			accept: 'application/json;odata=verbose',
			'content-type': 'application/json;odata=verbose',
			'X-RequestDigest': await getRequestDigest()
		},
		method: 'POST',
		data: Content
	}).catch(async err => {
		isError = true
		if (err.response.statusText === 'Not Found') {
			needToRetry = await createUnexistedFolder.call(this)
		}
	})
	if (needToRetry) {
		return createWithRESTFromString(element, opts)
	}
	if (isError) {
		throw new Error(`can't create file "${element.Url}" at ${contextUrl}/${listUrl}`)
	} else {
		let response
		if (Columns) {
			response = this
				.of({ Url: elementUrl, Columns })
				.update({ ...opts, silentInfo: true })
		} else if (needResponse) {
			response = this
				.of(elementUrl)
				.get(opts)
		}
		return response
	}
}

const createWithRESTFromBlob = async (element, opts = {}) => {
	let isError
	let needToRetry
	const inputs = []
	const { needResponse, silent, silentErrors } = opts
	const {
		Content = '',
		Overwrite,
		OnProgress = identity,
		Folder = '',
		Columns
	} = element
	const { contextUrl, listUrl } = this
	const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
	const folder = Folder || getFolderFromUrl(elementUrl)
	const filename = elementUrl ? getFilenameFromUrl(elementUrl) : Content.name
	const requiredInputs = {
		__REQUESTDIGEST: true,
		__VIEWSTATE: true,
		__EVENTTARGET: true,
		__EVENTVALIDATION: true,
		ctl00_PlaceHolderMain_ctl04_ctl01_uploadLocation: true,
		ctl00_PlaceHolderMain_UploadDocumentSection_ctl05_OverwriteSingle: true
	}

	const listGUID = cache.get(['listGUIDs', contextUrl, listUrl])
	const listFormMatches = cache.get(['listFormMatches', contextUrl, listUrl])
	const inputRE = /<input[^<]*\/>/g
	let founds = inputRE.exec(listFormMatches)
	while (founds) {
		const item = founds[0]
		const id = item.match(/id="([^"]+)"/)[1]
		if (requiredInputs[id]) {
			switch (id) {
				case '__EVENTTARGET':
					inputs.push(item.replace(/value="[^"]*"/, 'value="ctl00$PlaceHolderMain$ctl03$RptControls$btnOK"'))
					break
				case 'ctl00_PlaceHolderMain_ctl04_ctl01_uploadLocation':
					inputs.push(item.replace(/value="[^"]*"/, `value="/${folder.replace(/^\//, '')}"`))
					break
				case 'ctl00_PlaceHolderMain_UploadDocumentSection_ctl05_OverwriteSingle':
					inputs.push(Overwrite
						? item
						: item.replace(/checked="[^"]*"/, ''))
					break
				default:
					inputs.push(item)
					break
			}
		}
		founds = inputRE.exec(listFormMatches)
	}
	const form = window.document.createElement('form')
	form.innerHTML = join('')(inputs)
	const formData = new FormData(form)
	formData.append('ctl00$PlaceHolderMain$UploadDocumentSection$ctl05$InputFile', Content, filename)

	const response = await axios({
		url: `/${contextUrl}/_layouts/15/UploadEx.aspx?List={${listGUID}}`,
		method: 'POST',
		data: formData,
		onUploadProgress: e => OnProgress(Math.floor((e.loaded * 100) / e.total))
	})

	const errorMsgMatches = response.data.match(/id="ctl00_PlaceHolderMain_LabelMessage">([^<]*)<\/span>/)
	if (isArray(errorMsgMatches) && !silent && !silentErrors) console.error(errorMsgMatches[1])
	if (stringTest(/The selected location does not exist in this document library\./i)(response.data)) {
		isError = true
		needToRetry = await createUnexistedFolder()
	}
	if (needToRetry) {
		return createWithRESTFromBlob(element, opts)
	}
	if (isError) {
		throw new Error(`can't create file "${elementUrl}" at ${contextUrl}/${listUrl}`)
	} else {
		let res
		if (isObjectFilled(Columns)) {
			res = await this.of({ Url: elementUrl, Columns }).update({ ...opts, silentInfo: true })
		} else if (needResponse) {
			res = await this.of({ Url: elementUrl }).get(opts)
		}
		return res
	}
}

class Box extends AbstractBox {
	constructor(value) {
		super(value)
		this.joinProp = 'ServerRelativeUrl'
		this.value = this.isArray
			? ifThen(isArrayFilled)([
				pipe([map(liftFolderType), removeEmptyUrls, removeDuplicatedUrls]),
				constant([liftFolderType()])
			])(value)
			: liftFolderType(value)
	}

	getCount() {
		return this.isArray ? removeEmptyFilenames(this.value).length : hasUrlFilename(this.value[this.prop]) ? 1 : 0
	}
}

class FileList {
	constructor(parent, files) {
		this.name = 'file'
		this.parent = parent
		this.box = getInstance(Box)(files)
		this.contextUrl = parent.contextUrl
		this.getContextSPObject = parent.getContextSPObject
		this.getListSPObject = parent.getListSPObject
		this.iterator = deep1Iterator({
			contextUrl: this.contextUrl,
			elementBox: this.box
		})

		this.iteratorREST = deep1IteratorREST({
			elementBox: this.parent.box
		})
	}

	async	get(opts = {}) {
		const { contextUrl, listUrl } = this
		if (opts.asBlob) {
			const result = await this.iteratorREST(({ element }) => {
				const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
				return executorREST(contextUrl)({
					url: `${this.getRESTObject(elementUrl, listUrl, contextUrl)}/$value`,
					binaryStringResponseBody: true
				})
			})
			return prepareResponseREST(opts)(result)
		}
		const options = opts.asItem ? { ...opts, view: ['ListItemAllFields'] } : { ...opts }
		const { clientContexts, result } = await this.iterator(({ clientContext, element }) => {
			const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
			const listSPObject = this.getListSPObject(listUrl)(this.getContextSPObject(clientContext))
			const spObject = isExists(elementUrl) && hasUrlTailSlash(elementUrl)
				? this.getSPObjectCollection(elementUrl, listSPObject)
				: this.getSPObject(elementUrl, listSPObject)
			return load(clientContext)(spObject)(options)
		})
		await Promise.all(clientContexts.map(clientContext => executorJSOM(clientContext)(opts)))
		return prepareResponseJSOM(options)(result)
	}

	async	create(opts = {}) {
		const { contextUrl, listUrl } = this
		if (!cache.get(['listGUIDs', contextUrl, listUrl])) {
			const listProps = await this
				.parent
				.get({ view: 'Id' })
			cache.set(listProps.Id.toString())(['listGUIDs', contextUrl, listUrl])
		}
		if (!cache.get(['listFormMatches', contextUrl, listUrl])) {
			const listForms = await axios.get(
				`/${contextUrl}/_layouts/15/Upload.aspx?List={${cache.get(['listGUIDs', contextUrl, listUrl])}}`
			)
			cache.set(listForms.data.match(/<form(\w|\W)*<\/form>/))(['listFormMatches', contextUrl, listUrl])
		}
		const cacheUrl = ['fileCreationRetries', this.parent.parent.id]
		if (!isNumberFilled(cache.get(cacheUrl))) cache.set(CACHE_RETRIES_LIMIT)(cacheUrl)
		const res = await this.iteratorREST(({ element }) => {
			const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
			if (!hasUrlFilename(elementUrl) && (element.Content && !element.Content.name)) return undefined
			return isBlob(element.Content)
				? createWithRESTFromBlob.call(this, element, opts)
				: createWithRESTFromString.call(this, element, opts)
		})
		this.report('create', opts)
		return res
	}

	async	update(opts = {}) {
		const { contextUrl, listUrl } = this
		const options = opts.asItem ? { ...opts, view: ['ListItemAllFields'] } : { ...opts }
		if (!cache.get(['columns', contextUrl, listUrl])) {
			const columns = await this
				.parent
				.column()
				.get({
					view: ['TypeAsString', 'InternalName', 'Title', 'Sealed'],
					groupBy: 'InternalName'
				})
			cache.set(columns)(['columns', contextUrl, listUrl])
		}
		const { clientContexts, result } = await this.iterator(({ clientContext, element }) => {
			const { Content, Columns } = element
			const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
			if (!hasUrlFilename(elementUrl)) return undefined
			const contextSPObject = this.getContextSPObject(clientContext)
			const listSPObject = this.getListSPObject(listUrl, contextSPObject)
			let spObject
			if (isUndefined(Content)) {
				spObject = setItem(cache.get(['columns', contextUrl, listUrl]))(Object.assign({}, Columns))(
					this.getSPObject(elementUrl, listSPObject).get_listItemAllFields()
				)
			} else {
				const fieldsToUpdate = {}
				const keys = Reflect.ownKeys(Columns)
				for (let i = 0; i < keys.length; i += 1) {
					const fieldName = keys[i]
					const field = Columns[fieldName]
					fieldsToUpdate[fieldName] = ifThen(isArray)([join(';#;#')])(field)
				}
				const binaryInfo = getInstanceEmpty(SP.FileSaveBinaryInformation)
				setFields({
					set_content: convertFileContent(Content),
					set_fieldValues: fieldsToUpdate
				})(binaryInfo)
				spObject = this.getSPObject(elementUrl, listSPObject)
				spObject.saveBinary(binaryInfo)
				spObject = spObject.get_listItemAllFields()
			}
			return load(clientContext)(spObject.get_file())(options)
		})
		if (this.box.getCount()) {
			await Promise.all(clientContexts.map(clientContext => executorJSOM(clientContext)(options)))
		}
		this.report('update', options)
		return prepareResponseJSOM(options)(result)
	}

	async	delete(opts = {}) {
		const { contextUrl, listUrl } = this
		const { noRecycle } = opts
		const { clientContexts, result } = await this.iterator(({ clientContext, element }) => {
			const elementUrl = getListRelativeUrl(contextUrl)(listUrl)(element)
			if (!hasUrlFilename(elementUrl)) return undefined
			const listSPObject = this.getListSPObject(listUrl, this.getContextSPObject(clientContext))
			const spObject = this.getSPObject(elementUrl, listSPObject)
			methodEmpty(noRecycle ? 'deleteObject' : 'recycle')(spObject)
			return elementUrl
		})
		if (this.box.getCount()) {
			await Promise.all(clientContexts.map(clientContext => executorJSOM(clientContext)(opts)))
		}
		this.report(noRecycle ? 'delete' : 'recycle', opts)
		return prepareResponseJSOM(opts)(result)
	}

	async	copy(opts) {
		return copyOrMove.call(this, false, opts)
	}

	async	move(opts) {
		return copyOrMove.call(this, true, opts)
	}

	getSPObject(elementUrl, parentSPObject) {
		const filename = getFilenameFromUrl(elementUrl)
		const folder = getFolderFromUrl(elementUrl)
		return folder
			? getSPFolderByUrl(folder)(parentSPObject.get_rootFolder())
				.get_files()
				.getByUrl(filename)
			: parentSPObject
				.get_rootFolder()
				.get_files()
				.getByUrl(filename)
	}

	getSPObjectCollection(elementUrl, parentSPObject) {
		const folder = getFolderFromUrl(popSlash(elementUrl))
		return folder
			? getSPFolderByUrl(folder)(parentSPObject.get_rootFolder()).get_files()
			: parentSPObject.get_rootFolder().get_files()
	}

	getRESTObject(elementUrl, listUrl, contextUrl) {
		return mergeSlashes(
			`${this.getRESTObjectCollection(elementUrl, listUrl, contextUrl)
			}/getbyurl('${getFilenameFromUrl(elementUrl)
			}')`
		)
	}

	getRESTObjectCollection(elementUrl, listUrl, contextUrl) {
		const folder = getFolderFromUrl(elementUrl)
		const folderUrl = folder ? `/folders/getbyurl('${folder}')` : ''
		return mergeSlashes(
			`/${contextUrl}/_api/web/lists/getbytitle('${listUrl}')/rootfolder${folderUrl}/files`
		)
	}

	report(actionType, opts = {}) {
		listReport(actionType, {
			...opts,
			name: this.name,
			box: this.box,
			listBox: this.parent.box,
			contextBox: this.parent.parent.box
		})
	}

	of(files) {
		return getInstance(this.constructor)(this.parent, files)
	}
}

export default getInstance(FileList)
