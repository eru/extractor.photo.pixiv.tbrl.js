// ==Taberareloo==
// {
//   "name"        : "Photo Extractor for pixiv"
// , "description" : "Extract a pixiv photo"
// , "include"     : ["content"]
// , "match"       : ["http://www.pixiv.net/member_illust.php?*"]
// , "version"     : "0.0.3"
// , "downloadURL" : "https://raw.githubusercontent.com/eru/extractor.photo.pixiv.tbrl.js/master/extractor.photo.pixiv.tbrl.js"
// }
// ==/Taberareloo==

(function() {
  Extractors.register({
    name           : 'Photo - pixiv',
    ICON           : 'http://www.pixiv.net/favicon.ico',
    REFERRER       : 'http://www.pixiv.net/',
    PAGE_URL       : 'http://www.pixiv.net/member_illust.php' +
      '?mode=medium&illust_id=',
    DIR_IMG_RE     : new RegExp(
      '^https?://(?:[^.]+\\.)?(?:secure\\.)?pixiv\\.net/' +
        'img\\d+/(?:works/\\d+x\\d+|img)/[^/]+/' +
        '(?:mobile/)?(\\d+)(?:_p(\\d+)|_[^_]+)*\\.'
    ),
    DATE_IMG_RE    : new RegExp(
      '^https?://(?:[^.]+\\.)?(?:secure\\.)?pixiv\\.net/' +
        '(?:c/\\d+x\\d+/img-master|img-inf|img-original)' +
        '/img/\\d+/\\d+/\\d+/\\d+/\\d+/\\d+' +
        '/(\\d+)(?:-[\\da-f]{32})?(?:_(?:p|ugoira)(\\d+))?'
    ),
    IMG_PAGE_RE    : /^https?:\/\/(?:[^.]+\.)?pixiv\.net\/member_illust\.php/,
    // via http://help.pixiv.net/171/
    IMG_EXTENSIONS : ['jpg', 'png', 'gif', 'jpeg'],
    FIRST_BIG_P_ID : 11319936,
    check(ctx) {
      return !ctx.selection && this.getIllustID(ctx);
    },
    extract(ctx) {
      let that = this,
          retry = true;

      return this.getInfo(ctx).then(function getImage(info) {
        let {imageURL, pageTitle, illustID} = info;

        return downloadFile(
          imageURL,
          {
            referer : that.REFERRER
          }
        ).then(file => {
          ctx.title = pageTitle;
          ctx.href = that.PAGE_URL + illustID;

          return {
            type    : 'photo',
            item    : pageTitle,
            itemUrl : imageURL,
            file    : file
          };
        }).catch(err => {
          // when image extension is wrong
          if (retry) {
            retry = false;

            if (that.DATE_IMG_RE.test(imageURL)) {
              return that.fixImageExtensionFromList(info).then(getImage);
            }
          }

          throw err;
        });
      });
    },
    getIllustID(ctx) {
      let imageURL = (ctx.onImage && ctx.target.src) || '',
          backgroundImageURL = (ctx.hasBGImage && ctx.bgImageURL) || '',
          targetURL = (ctx.onLink && ctx.link.href) || ctx.href || '';

      for (let url of [imageURL, backgroundImageURL, targetURL]) {
        if (this.DIR_IMG_RE.test(url) || this.DATE_IMG_RE.test(url)) {
          return url.extract(
            this.DIR_IMG_RE.test(url) ? this.DIR_IMG_RE : this.DATE_IMG_RE
          );
        }
      }

      if (
        this.isImagePage(ctx.link) || (
          !imageURL && targetURL === ctx.href && this.isImagePage(ctx) &&
            this.getImageURLFromDocument(ctx)
        )
      ) {
        return (new URL(targetURL)).searchParams.get('illust_id');
      }
    },
    getInfo(ctx) {
      let illustID = this.getIllustID(ctx);

      return this.getMediumPage(ctx, illustID).then(doc => {
        let url = this.getImageURLFromDocument({document : doc}, illustID);

        if (
          !url || (!this.DIR_IMG_RE.test(url) && !this.DATE_IMG_RE.test(url))
        ) {
          // for limited access about mypixiv & age limit on login, and delete
          throw new Error(chrome.i18n.getMessage('error_http404'));
        }

        let info = {
          imageURL  : url,
          pageTitle : doc.title,
          illustID  : illustID
        };

        return Promise.resolve().then(() =>
          this.DATE_IMG_RE.test(url) && /\/img-inf\//.test(url) &&
            !this.isUgoiraPage(doc) ?
            this.getLargeThumbnailURL(url) :
            (this.getFullSizeImageURL(ctx, info, doc) || url)
        ).then(imageURL => Object.assign(info, {imageURL}));
      });
    },
    getMediumPage(ctx, illustID) {
      if (!ctx.onImage && !ctx.onLink && this.isImagePage(ctx, 'medium')) {
        return Promise.resolve(ctx.document);
      }

      return request(this.PAGE_URL + illustID, {
        responseType : 'document'
      }).then(({response : doc}) => doc);
    },
    isImagePage(target, mode) {
      if (target && this.IMG_PAGE_RE.test(target.href)) {
        let queries = queryHash(target.search);

        return Boolean(
          queries.illust_id && (mode ? queries.mode === mode : queries.mode)
        );
      }

      return false;
    },
    isUgoiraPage(doc) {
      return Boolean(doc.querySelector('._ugoku-illust-player-container'));
    },
    getImageURLFromDocument(ctx, illustID) {
      let img = this.getImageElement(ctx, illustID);

      if (img) {
        let url = img.src || img.dataset.src;

        if (url) {
          return url;
        }
      }

      let doc = ctx.document;

      if (this.isUgoiraPage(doc)) {
        let ogImage = doc.querySelector('meta[property="og:image"]');

        if (ogImage) {
          let url = ogImage.content;

          if (url) {
            return url;
          }
        }

        return this.getUgoiraImageURLFromDocument(doc);
      }

      return '';
    },
    getImageElement(ctx, illustID) {
      let currentIllustID = illustID || queryHash(ctx.search).illust_id,
          anchor = `a[href*="illust_id=${currentIllustID}"]`;

      return ctx.document.querySelector([
        // mode=medium on login
        anchor + ' > div > img',
        '.works_display > div > img',
        // mode=big and mode=manga_big on login
        'body > img:only-child',
        // mode=manga
        'img.image',
        // book(mode=manga)
        'div.image > img',
        // non-r18 illust on logout
        '.cool-work-main > .img-container > a.medium-image > img',
        // r18 on logout
        '.cool-work-main > .sensored > img',
        // ugoira on logout
        anchor + ` > img[src*="${currentIllustID}"]`
      ].join(', '));
    },
    getUgoiraImageURLFromDocument(doc) {
      let str = doc.body.innerHTML.extract(
        /pixiv\.context\.ugokuIllustFullscreenData\s*=\s*({.+});/
      );

      if (str) {
        let info = JSON.parse(str);

        if (info) {
          let {src} = info;

          if (src) {
            let urlObj = new URL(src);

            urlObj.pathname = urlObj.pathname
              .replace(/^\/img-zip-ugoira\//, '/img-original/')
              .replace(/_ugoira\d+x\d+\.zip$/, '_ugoira0.jpg');

            return urlObj.toString();
          }
        }
      }

      return '';
    },
    getLargeThumbnailURL(url) {
      let urlObj = new URL(url);

      urlObj.pathname = urlObj.pathname.replace(
        /(\/\d+(?:_[\da-f]{10})?_)[^_.]+\./,
        '$1s.'
      );

      return urlObj.toString();
    },
    getFullSizeImageURL(ctx, info, doc) {
      let cleanedURL = this.getCleanedURL(info.imageURL);

      if (!this.isOldIllustPage(cleanedURL, doc)) {
        let pageNum = this.getPageNumber(ctx);

        if (this.isUgoiraPage(doc)) {
          let urlObj = new URL(cleanedURL);

          urlObj.pathname = urlObj.pathname.replace(
            /^\/(?:c\/\d+x\d+\/img-master|img-inf)\//,
            '/img-original/'
          ).replace(
            /(\/\d+(?:-[\da-f]{32})?_)[^.\/]+\./,
            `$1ugoira${pageNum}.`
          );

          return urlObj.toString();
        }
        if (this.DIR_IMG_RE.test(cleanedURL)) {
          return cleanedURL.replace(
            /img\/[^\/]+\/\d+(?:_[\da-f]{10})?/,
            '$&_' + (this.FIRST_BIG_P_ID > info.illustID ? '' : 'big_') +
              'p' + pageNum
          );
        }
        if (this.DATE_IMG_RE.test(cleanedURL)) {
          return cleanedURL.replace(
            /(\/\d+(?:-[\da-f]{32})?_p)\d+/,
            '$1' + pageNum
          );
        }
      }

      return cleanedURL;
    },
    getCleanedURL(url) {
      let urlObj = new URL(url),
          {pathname} = urlObj;

      if (this.DIR_IMG_RE.test(url)) {
        pathname = pathname.replace(/works\/\d+x\d+/, 'img').replace(
          /(img\/[^\/]+\/)(?:mobile\/)?(\d+(?:_[\da-f]{10})?)(?:_[^.]+)?/,
          '$1$2'
        );
      } else if (
        this.DATE_IMG_RE.test(url) &&
          /^\/c\/\d+x\d+\/img-master\//.test(pathname) &&
          /\/\d+(?:-[\da-f]{32})?_p\d+_(?:master|square)\d+\./.test(pathname)
      ) {
        pathname = pathname.replace(
          /^\/c\/\d+x\d+\/img-master\//,
          '/img-original/'
        ).replace(
          /(\/\d+(?:-[\da-f]{32})?_p\d+)_(?:master|square)\d+\./,
          '$1.'
        );
      }

      urlObj.pathname = pathname;

      return urlObj.toString();
    },
    isOldIllustPage(url, doc) {
      if (this.DIR_IMG_RE.test(url)) {
        let pageTitle = doc.title;

        if (doc.querySelector('.introduction form')) {
          let authorNameElm = doc.querySelector('.userdata > .name');

          if (authorNameElm) {
            return pageTitle.endsWith(
              `」イラスト/${authorNameElm.textContent.trim()} [pixiv]`
            );
          }
        }

        return pageTitle.endsWith('のイラスト [pixiv]');
      }

      return false;
    },
    getPageNumber(ctx) {
      let imageURL = (ctx.onImage && ctx.target.src) || '',
          backgroundImageURL = (ctx.hasBGImage && ctx.bgImageURL) || '',
          targetURL = (ctx.onLink && ctx.link.href) || ctx.href || '';

      return (() => {
        for (let url of [imageURL, backgroundImageURL, targetURL]) {
          if (url) {
            let urlObj = new URL(url);

            if (this.DIR_IMG_RE.test(url) || this.DATE_IMG_RE.test(url)) {
              return url.extract(
                this.DIR_IMG_RE.test(url) ? this.DIR_IMG_RE : this.DATE_IMG_RE,
                2
              );
            }
            if (this.isImagePage(urlObj, 'manga_big')) {
              return urlObj.searchParams.get('page');
            }
          }
        }
      })() || '0';
    },
    fixImageExtensionFromList(info) {
      let that = this,
          uriObj = createURI(info.imageURL),
          extension = uriObj.fileExtension,
          extensions = this.IMG_EXTENSIONS.filter(candidate =>
            extension !== candidate
          );

      return (function recursive() {
        uriObj.fileExtension = extensions.shift();

        let imageURL = uriObj.spec;

        return downloadFile(imageURL, that.REFERRER).then(() =>
          Object.assign(info, {imageURL})
        ).catch(() => {
          if (extensions.length) {
            return recursive();
          }

          throw new Error(chrome.i18n.getMessage('error_http404'));
        });
      }());
    }
  }, 'Photo');
})();
