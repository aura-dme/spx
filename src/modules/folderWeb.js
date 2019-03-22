import {
  AbstractBox,
  getInstance,
  methodEmpty,
  prepareResponseJSOM,
  load,
  executorJSOM,
  switchCase,
  getTitleFromUrl,
  identity,
  popSlash,
  getParentUrl,
  method,
  ifThen,
  constant,
  pipe,
  hasUrlTailSlash,
  getWebRelativeUrl,
  typeOf,
  shiftSlash,
  mergeSlashes,
  isArrayFilled,
  map,
  removeEmptyUrls,
  removeDuplicatedUrls,
  deep2Iterator,
  webReport
} from './../lib/utility';
import site from './../modules/site';

//Internal

const NAME = 'folder';

const getSPObject = elementUrl => ifThen(constant(elementUrl))([
  method('getFolderByServerRelativeUrl')(elementUrl),
  spObject => {
    const rootFolder = methodEmpty('get_rootFolder')(spObject);
    rootFolder.isRoot = true;
    return rootFolder
  }
])

const getSPObjectCollection = elementUrl => pipe([
  ifThen(constant(!elementUrl || elementUrl === '/'))([
    getSPObject(),
    getSPObject(popSlash(elementUrl))
  ]),
  methodEmpty('get_folders')
])

const liftFolderType = switchCase(typeOf)({
  object: context => {
    const newContext = Object.assign({}, context);
    if (!context.Url && context.ServerRelativeUrl) newContext.Url = context.ServerRelativeUrl;
    if (context.Url !== '/') newContext.Url = shiftSlash(newContext.Url);
    if (!context.ServerRelativeUrl && context.Url) newContext.ServerRelativeUrl = context.Url;
    return newContext
  },
  string: contextUrl => {
    const url = contextUrl === '/' ? '/' : shiftSlash(mergeSlashes(contextUrl));
    return {
      Url: url,
      ServerRelativeUrl: url
    }
  },
  default: _ => ({
    Url: '',
    ServerRelativeUrl: ''
  })
})

class Box extends AbstractBox {
  constructor(value) {
    super(value);
    this.joinProp = 'ServerRelativeUrl';
    this.value = this.isArray
      ? ifThen(isArrayFilled)([
        pipe([
          map(liftFolderType),
          removeEmptyUrls,
          removeDuplicatedUrls
        ]),
        constant([liftFolderType()])
      ])(value)
      : liftFolderType(value);
  }
}

// Inteface

export default (parent, elements) => {
  const instance = {
    box: getInstance(Box)(elements),
    parent,
  };
  return {
    get: async opts => {
      const { clientContexts, result } = await deep2Iterator({
        contextBox: instance.parent.box,
        elementBox: instance.box
      })(({ contextElement, clientContext, element }) => {
        const parentSPObject = instance.parent.getSPObject(clientContext);
        const contextUrl = contextElement.Url;
        const elementUrl = getWebRelativeUrl(contextUrl)(element.Url);
        const isCollection = hasUrlTailSlash(elementUrl);
        const spObject = isCollection
          ? getSPObjectCollection(elementUrl)(parentSPObject)
          : getSPObject(elementUrl)(parentSPObject);
        return load(clientContext)(spObject)(opts);
      });
      await instance.parent.box.chain(el => Promise.all(clientContexts[el.Url].map(clientContext => executorJSOM(clientContext)(opts))))
      return prepareResponseJSOM(opts)(result);
    },

    create: async function create(opts) {
      const { clientContexts, result } = await deep2Iterator({
        contextBox: instance.parent.box,
        elementBox: instance.box
      })(({ contextElement, clientContext, element }) => {
        const elementUrl = getWebRelativeUrl(contextElement.Url)(element.Url);
        const parentFolderUrl = getParentUrl(elementUrl);
        const spObject = getSPObjectCollection(`${parentFolderUrl}/`)(instance.parent.getSPObject(clientContext)).add(getTitleFromUrl(elementUrl));
        return load(clientContext)(spObject)(opts);
      });

      let needToRetry;
      await instance.parent.box.chain(async el => {
        for (const clientContext of clientContexts[el.Url]) {
          await executorJSOM(clientContext)({ ...opts, silentErrors: true }).catch(async err => {
            if (err.get_message() === 'File Not Found.') {
              const foldersToCreate = {};
              await deep2Iterator({
                contextBox: instance.parent.box,
                elementBox: instance.box
              })(({ contextElement, element }) => {
                const elementUrl = getWebRelativeUrl(contextElement.Url)(element.Url);
                foldersToCreate[getParentUrl(elementUrl)] = true;
              })
              await site(clientContext.get_url()).folder(Object.keys(foldersToCreate)).create({ silent: true, expanded: true, view: ['Name'] }).then(_ => {
                needToRetry = true;
              }).catch(identity)
            } else {
              console.error(err.get_message())
            }
          })
          if (needToRetry) break;
        }
      });
      if (needToRetry) {
        return create(opts)
      } else {
        webReport({ ...opts, NAME, actionType: 'create', box: instance.box, contextBox: instance.parent.box });
        return prepareResponseJSOM(opts)(result);
      }
    },

    delete: async (opts = {}) => {
      const { noRecycle } = opts;
      const { clientContexts, result } = await deep2Iterator({
        contextBox: instance.parent.box,
        elementBox: instance.box
      })(({ contextElement, clientContext, element }) => {
        const contextUrl = contextElement.Url;
        const elementUrl = getWebRelativeUrl(contextUrl)(element.Url);
        const parentSPObject = instance.parent.getSPObject(clientContext);
        const spObject = getSPObject(elementUrl)(parentSPObject);
        !spObject.isRoot && methodEmpty(noRecycle ? 'deleteObject' : 'recycle')(spObject)
      });
      await instance.parent.box.chain(el => Promise.all(clientContexts[el.Url].map(clientContext => executorJSOM(clientContext)(opts))))
      webReport({ ...opts, NAME, actionType: noRecycle ? 'delete' : 'recycle', box: instance.box, contextBox: instance.parent.box });
      return prepareResponseJSOM(opts)(result);
    }
  }
}