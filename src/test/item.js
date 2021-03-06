/* eslint no-unused-vars:0 */
import web from '../modules/web'
import {
	assertObject,
	assertCollection,
	testWrapper,
	assert,
	map,
	prop,
	reduce,
	identity
} from '../lib/utility'

const PROPS = [
	'AppAuthor',
	'AppEditor',
	'Attachments',
	'Author',
	'ContentTypeId',
	'Created',
	'Created_x0020_Date',
	'Editor',
	'FSObjType',
	'FileDirRef',
	'FileLeafRef',
	'FileRef',
	'File_x0020_Type',
	'FolderChildCount',
	'GUID',
	'ID',
	'InstanceID',
	'ItemChildCount',
	'Last_x0020_Modified',
	'MetaInfo',
	'Modified',
	'Order',
	'ProgId',
	'ScopeId',
	'SortBehavior',
	'SyncClientId',
	'Title',
	'UniqueId',
	'WorkflowInstanceID',
	'WorkflowVersion',
	'lookup',
	'owshiddenversion',
	'_CopySource',
	'_HasCopyDestinations',
	'_IsCurrentVersion',
	'_Level',
	'_ModerationComments',
	'_ModerationStatus',
	'_UIVersion',
	'_UIVersionString'
]

const USER_PROPS = [
	'AdjustHijriDays',
	'AltCalendarType',
	'AppAuthor',
	'AppEditor',
	'Attachments',
	'Author',
	'CalendarType',
	'CalendarViewOptions',
	'ContentLanguages',
	'ContentTypeId',
	'Created',
	'Created_x0020_Date',
	'Deleted',
	'Department',
	'EMail',
	'Editor',
	'FSObjType',
	'FileDirRef',
	'FileLeafRef',
	'FileRef',
	'File_x0020_Type',
	'FirstName',
	'FolderChildCount',
	'GUID',
	'ID',
	'InstanceID',
	'IsActive',
	'IsSiteAdmin',
	'ItemChildCount',
	'JobTitle',
	'LastName',
	'Last_x0020_Modified',
	'Locale',
	'MUILanguages',
	'MetaInfo',
	'MobilePhone',
	'Modified',
	'Name',
	'Notes',
	'Office',
	'Order',
	'Picture',
	'ProgId',
	'SPSPictureExchangeSyncState',
	'SPSPicturePlaceholderState',
	'SPSPictureTimestamp',
	'SPSResponsibility',
	'ScopeId',
	'SipAddress',
	'SortBehavior',
	'SyncClientId',
	'Time24',
	'TimeZone',
	'Title',
	'UniqueId',
	'UserEmail',
	'UserInfoHidden',
	'UserName',
	'WebSite',
	'WorkDayEndHour',
	'WorkDayStartHour',
	'WorkDays',
	'WorkPhone',
	'WorkflowInstanceID',
	'WorkflowVersion',
	'owshiddenversion',
	'_CopySource',
	'_HasCopyDestinations',
	'_IsCurrentVersion',
	'_Level',
	'_ModerationComments',
	'_ModerationStatus',
	'_UIVersion',
	'_UIVersionString'
]

const assertObjectProps = assertObject(PROPS)
const assertCollectionProps = assertCollection(PROPS)

const assertObjectUserProps = assertObject(USER_PROPS)
const assertCollectionUserProps = assertCollection(USER_PROPS)

const userWebList = web().list('b327d30a-b9bf-4728-a3c1-a6b4f0253ff2')
const workingWebList = web('test/spx').list('Items')
const workingTagWebList = web('test/spx').list('Keywords')

const crud = async () => {
	const folder = 'a'
	await workingWebList
		.folder(folder)
		.delete({ noRecycle: true, silentErrors: true })
		.catch(identity)
	const newItem = await workingWebList
		.item({ Folder: folder, Columns: { Title: 'new item' } })
		.create({ view: ['ID', 'Title', 'FileDirRef'] })
	assert('Title is not a "new item"')(newItem.Title === 'new item')
	assert('FileDirRef is not a "/test/spx/Lists/Items/a"')(newItem.FileDirRef === '/test/spx/Lists/Items/a')
	const updatedItem = await workingWebList.item({ ID: newItem.ID, Title: 'updated item' }).update()
	assert('Title is not a "updated item"')(updatedItem.Title === 'updated item')
	await workingWebList.item(newItem.ID).delete({ noRecycle: true })
}

const crudTags = async () => {
	const folder = 'a'
	await workingTagWebList
		.folder(folder)
		.delete({ noRecycle: true })
		.catch(identity)
	const newItem = await workingTagWebList
		.item({ Folder: folder, Columns: { TaxKeyword: ['b2b|34e20559-f098-48f1-b9af-93ac54b0841b'] } })
		.create({ view: ['ID', 'TaxKeyword', 'FileDirRef'] })
	assert('Title is not a b2b"')(newItem.TaxKeyword.$2_1[0].$0_1 === 'b2b')
	assert('FileDirRef is not a "/test/spx/Lists/Keywords/a"')(newItem.FileDirRef === '/test/spx/Lists/Keywords/a')
	const updatedItem = await workingTagWebList
		.item({ ID: newItem.ID, TaxKeyword: ['a|b1bcd272-e0e4-47b0-9560-a63c0be091ad'] })
		.update()
	assert('Title is not a "a"')(updatedItem.TaxKeyword.$2_1[0].$0_1 === 'a')
	await workingTagWebList.item(newItem.ID).delete({ noRecycle: true })
}

const crudCollection = async () => {
	const folder = 'b'
	await workingWebList
		.folder(folder)
		.delete({ noRecycle: true })
		.catch(identity)
	const newItems = await workingWebList
		.item([
			{
				Folder: folder,
				Columns: {
					Title: 'new item'
				}
			},
			{
				Folder: folder,
				Columns: {
					Title: 'new item another'
				}
			}
		])
		.create({ view: ['FileDirRef', 'ID', 'Title'] })
	// console.log(newItems);
	assert('Title is not a "new item"')(newItems[0].Title === 'new item')
	assert('Title is not a "new item another"')(newItems[1].Title === 'new item another')
	assert(`FileDirRef is not a "/test/spx/Lists/Items/${folder}"`)(
		newItems[0].FileDirRef === `/test/spx/Lists/Items/${folder}`
	)
	assert(`FileDirRef is not a "/test/spx/Lists/Items/${folder}"`)(
		newItems[1].FileDirRef === `/test/spx/Lists/Items/${folder}`
	)
	const updatedItems = await workingWebList
		.item([
			{
				ID: newItems[0].ID,
				Title: 'updated item'
			},
			{
				ID: newItems[1].ID,
				Title: 'updated item another'
			}
		])
		.update({ view: ['FileDirRef', 'ID'] })
	assert('Title is not a "updated item"')(updatedItems[0].Title === 'updated item')
	assert('Title is not a "updated item another"')(updatedItems[1].Title === 'updated item another')
	assert(`FileDirRef is not a "/test/spx/Lists/Items/${folder}"`)(
		updatedItems[0].FileDirRef === `/test/spx/Lists/Items/${folder}`
	)
	assert(`FileDirRef is not a "/test/spx/Lists/Items/${folder}"`)(
		updatedItems[1].FileDirRef === `/test/spx/Lists/Items/${folder}`
	)
	await workingWebList.item([newItems[0].ID, newItems[1].ID]).delete({ noRecycle: true })
}

const crudBundle = async () => {
	const itemsToCreate = []
	const bundleList = web('test/spx').list('Bundle')
	const folder = 'c/b'
	await bundleList
		.folder(folder)
		.delete({ noRecycle: true })
		.catch(identity)
	for (let i = 0; i < 2000; i += 1) itemsToCreate.push({ Title: `test ${i}`, Folder: folder })
	const newItems = await bundleList.item(itemsToCreate).create()
	newItems.map(el => assert('Title does not contain a "test"')(/test/.test(el.Title)))
	const itemsToUpdate = reduce(acc => el => acc.concat({ ID: el.ID, Title: `${el.Title} updated` }))([])(newItems)
	const updatedItems = await bundleList.item(itemsToUpdate).update()
	updatedItems.map(el => assert('Title does not contain a "updated"')(/updated/.test(el.Title)))
	const itemsTodelete = map(prop('ID'))(updatedItems)
	const deleted = await bundleList.item(itemsTodelete).delete({ noRecycle: true, expanded: true })
	const deletedItems = await bundleList.item({ Folder: folder }).get()
	assert('items are not deleted')(!deletedItems.length)
}

const page = async () => {
	const limit = 10
	const spxList = web('test/spx').list('Pager')
	const firstPage = await spxList.item({ Page: { ID: 10 }, Limit: limit }).get()
	// console.log(firstPage)
	const secondPage = await spxList.item({ Page: { ID: 30 }, Limit: limit }).get()
	// console.log(secondPage)

	const firstPageDesc = await spxList.item({
		Page: {
			ID: 40,
			Columns: {
				Title: 'test39'
			}
		},
		Limit: limit,
		OrderBy: ['Title>']
	}).get()
	// console.log(firstPageDesc)
	const secondPageDesc = await spxList.item({
		Page: {
			ID: 20,
			Columns: {
				Title: 'test19'
			}
		},
		Limit: limit,
		OrderBy: 'Title>'
	}).get()
	// console.log(secondPageDesc)
}

export default {
	get: () => testWrapper('item GET')([
		() => assertObjectUserProps('user item 10842 ID')(userWebList.item(10842).get()),
		() => assertCollectionUserProps('user item first')(userWebList.item({ Limit: 1 }).get()),
		() => assertCollectionUserProps('user item 10842 ID')(userWebList.item('ID eq 10842').get()),
		() => assertCollectionProps('item')(workingWebList.item().get()),
		() => assertObjectProps('item 305 ID ')(workingWebList.item(305).get()),
		() => assertCollectionProps('folder d item')(workingWebList.item({ Folder: 'd' }).get()),
		() => assertCollectionProps('folders d, e items')(workingWebList.item([{
			Folder: 'd'
		}, {
			Folder: 'e'
		}]).get()),
	]),
	crud: () => testWrapper('item CRUD')([crud]),
	crudCollection: () => testWrapper('item CRUD Collection')([crudCollection]),
	crudTags: () => testWrapper('item CRUD tags')([crudTags]),
	page: () => testWrapper('item Page')([page]),
	crudBundle: () => testWrapper('item CRUD Bundle')([crudBundle]),
	all() {
		testWrapper('item ALL')([
			this.get,
			this.crud,
			this.crudCollection,
			this.crudTags,
			this.page,
			this.crudBundle
		])
	}
}
