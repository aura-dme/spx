
/* eslint no-unused-vars:0 */
import cache from './cache'
import web from './web'
import column from './column'
import fileList from './fileList'
import fileWeb from './fileWeb'
import folderList from './folderList'
import folderWeb from './folderWeb'
import item from './item'
import list from './list'
import user from './user'
import tag from './tag'
import queryParser from './query-parser'
import { testIsOk } from '../lib/utility'

export default async () => {
	// await cache()
	// await web()
	// await folderWeb()
	// await fileWeb()
	// await list()
	// await column()
	// await folderList();
	// await fileList();
	// await item()
	// await tag()
	// await queryParser()
	testIsOk('whole test')()
}
