// ==Taberareloo==
// {
//   "name"        : "Photo Extractor for pixiv"
// , "description" : "Extract a pixiv photo"
// , "include"     : ["content"]
// , "match"       : ["http://www.pixiv.net/member_illust.php?*"]
// , "version"     : "0.0.4"
// , "downloadURL" : "https://raw.githubusercontent.com/eru/extractor.photo.pixiv.tbrl.js/master/extractor.photo.pixiv.tbrl.js"
// }
// ==/Taberareloo==

'use strict';

(function () {
  Extractors.register({
    name: 'Photo - pixiv',
    ICON: 'http://www.pixiv.net/favicon.ico',
    REFERRER: 'http://www.pixiv.net/',
    PAGE_URL: 'http://www.pixiv.net/member_illust.php' + '?mode=medium&illust_id=',
    DIR_IMG_RE: new RegExp('^https?://(?:[^.]+\\.)?(?:secure\\.)?pixiv\\.net/' + 'img\\d+/(?:works/\\d+x\\d+|img)/[^/]+/' + '(?:mobile/)?(\\d+)(?:_p(\\d+)|_[^_]+)*\\.'),
    DATE_IMG_RE: new RegExp('^https?://(?:[^.]+\\.)?(?:secure\\.)?pixiv\\.net/' + '(?:c/\\d+x\\d+/img-master|img-inf|img-original)' + '/img/\\d+/\\d+/\\d+/\\d+/\\d+/\\d+' + '/(\\d+)(?:-[\\da-f]{32})?(?:_(?:p|ugoira)(\\d+))?'),
    IMG_PAGE_RE: /^https?:\/\/(?:[^.]+\.)?pixiv\.net\/member_illust\.php/,
    // via http://help.pixiv.net/171/
    IMG_EXTENSIONS: ['jpg', 'png', 'gif', 'jpeg'],
    FIRST_BIG_P_ID: 11319936,
    check: function check(ctx) {
      return !ctx.selection && this.getIllustID(ctx);
    },
    extract: function extract(ctx) {
      var that = this,
          retry = true;

      return this.getInfo(ctx).then(function getImage(info) {
        var imageURL = info.imageURL;
        var pageTitle = info.pageTitle;
        var illustID = info.illustID;

        return downloadFile(imageURL, {
          referrer: that.REFERRER // useless
        }).then(function (file) {
          ctx.title = pageTitle;
          ctx.href = that.PAGE_URL + illustID;

          return {
            type: 'photo',
            item: pageTitle,
            itemUrl: imageURL,
            file: file
          };
        })['catch'](function (err) {
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
    getIllustID: function getIllustID(ctx) {
      var imageURL = ctx.onImage && ctx.target.src || '',
          backgroundImageURL = ctx.hasBGImage && ctx.bgImageURL || '',
          targetURL = ctx.onLink && ctx.link.href || ctx.href || '';

      var _arr = [imageURL, backgroundImageURL, targetURL];
      for (var _i = 0; _i < _arr.length; _i++) {
        var url = _arr[_i];
        if (this.DIR_IMG_RE.test(url) || this.DATE_IMG_RE.test(url)) {
          return url.extract(this.DIR_IMG_RE.test(url) ? this.DIR_IMG_RE : this.DATE_IMG_RE);
        }
      }

      if (this.isImagePage(ctx.link) || !imageURL && targetURL === ctx.href && this.isImagePage(ctx) && this.getImageURLFromDocument(ctx)) {
        return new URL(targetURL).searchParams.get('illust_id');
      }
    },
    getInfo: function getInfo(ctx) {
      var _this = this;

      var illustID = this.getIllustID(ctx);

      return this.getMediumPage(ctx, illustID).then(function (doc) {
        var url = _this.getImageURLFromDocument({ document: doc }, illustID);

        if (!url || !_this.DIR_IMG_RE.test(url) && !_this.DATE_IMG_RE.test(url)) {
          // for limited access about mypixiv & age limit on login, and delete
          throw new Error(chrome.i18n.getMessage('error_http404'));
        }

        var info = {
          imageURL: url,
          pageTitle: doc.title,
          illustID: illustID
        };

        return Promise.resolve().then(function () {
          return _this.DATE_IMG_RE.test(url) && /\/img-inf\//.test(url) && !_this.isUgoiraPage(doc) ? _this.getLargeThumbnailURL(url) : _this.getFullSizeImageURL(ctx, info, doc) || url;
        }).then(function (imageURL) {
          return Object.assign(info, { imageURL: imageURL });
        });
      });
    },
    getMediumPage: function getMediumPage(ctx, illustID) {
      if (!ctx.onImage && !ctx.onLink && this.isImagePage(ctx, 'medium')) {
        return Promise.resolve(ctx.document);
      }

      return request(this.PAGE_URL + illustID, {
        responseType: 'document'
      }).then(function (_ref) {
        var doc = _ref.response;
        return doc;
      });
    },
    isImagePage: function isImagePage(target, mode) {
      if (target && this.IMG_PAGE_RE.test(target.href)) {
        var queries = queryHash(target.search);

        return Boolean(queries.illust_id && (mode ? queries.mode === mode : queries.mode));
      }

      return false;
    },
    isUgoiraPage: function isUgoiraPage(doc) {
      return Boolean(doc.querySelector('._ugoku-illust-player-container'));
    },
    getImageURLFromDocument: function getImageURLFromDocument(ctx, illustID) {
      var img = this.getImageElement(ctx, illustID);

      if (img) {
        var url = img.src || img.dataset.src;

        if (url) {
          return url;
        }
      }

      var doc = ctx.document;

      if (this.isUgoiraPage(doc)) {
        var ogImage = doc.querySelector('meta[property="og:image"]');

        if (ogImage) {
          var url = ogImage.content;

          if (url) {
            return url;
          }
        }

        return this.getUgoiraImageURLFromDocument(doc);
      }

      return '';
    },
    getImageElement: function getImageElement(ctx, illustID) {
      var currentIllustID = illustID || queryHash(ctx.search).illust_id,
          anchor = 'a[href*="illust_id=' + currentIllustID + '"]';

      return ctx.document.querySelector([
      // mode=medium on login
      anchor + ' > div > img', '.works_display > div > img',
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
      anchor + (' > img[src*="' + currentIllustID + '"]')].join(', '));
    },
    getUgoiraImageURLFromDocument: function getUgoiraImageURLFromDocument(doc) {
      var str = doc.body.innerHTML.extract(/pixiv\.context\.ugokuIllustFullscreenData\s*=\s*({.+});/);

      if (str) {
        var info = JSON.parse(str);

        if (info) {
          var src = info.src;

          if (src) {
            var urlObj = new URL(src);

            urlObj.pathname = urlObj.pathname.replace(/^\/img-zip-ugoira\//, '/img-original/').replace(/_ugoira\d+x\d+\.zip$/, '_ugoira0.jpg');

            return urlObj.toString();
          }
        }
      }

      return '';
    },
    getLargeThumbnailURL: function getLargeThumbnailURL(url) {
      var urlObj = new URL(url);

      urlObj.pathname = urlObj.pathname.replace(/(\/\d+(?:_[\da-f]{10})?_)[^_.]+\./, '$1s.');

      return urlObj.toString();
    },
    getFullSizeImageURL: function getFullSizeImageURL(ctx, info, doc) {
      var cleanedURL = this.getCleanedURL(info.imageURL);

      if (!this.isOldIllustPage(cleanedURL, doc)) {
        var pageNum = this.getPageNumber(ctx);

        if (this.isUgoiraPage(doc)) {
          var urlObj = new URL(cleanedURL);

          urlObj.pathname = urlObj.pathname.replace(/^\/(?:c\/\d+x\d+\/img-master|img-inf)\//, '/img-original/').replace(/(\/\d+(?:-[\da-f]{32})?_)[^.\/]+\./, '$1ugoira' + pageNum + '.');

          return urlObj.toString();
        }
        if (this.DIR_IMG_RE.test(cleanedURL)) {
          return cleanedURL.replace(/img\/[^\/]+\/\d+(?:_[\da-f]{10})?/, '$&_' + (this.FIRST_BIG_P_ID > info.illustID ? '' : 'big_') + 'p' + pageNum);
        }
        if (this.DATE_IMG_RE.test(cleanedURL)) {
          return cleanedURL.replace(/(\/\d+(?:-[\da-f]{32})?_p)\d+/, '$1' + pageNum);
        }
      }

      return cleanedURL;
    },
    getCleanedURL: function getCleanedURL(url) {
      var urlObj = new URL(url);
      var pathname = urlObj.pathname;

      if (this.DIR_IMG_RE.test(url)) {
        pathname = pathname.replace(/works\/\d+x\d+/, 'img').replace(/(img\/[^\/]+\/)(?:mobile\/)?(\d+(?:_[\da-f]{10})?)(?:_[^.]+)?/, '$1$2');
      } else if (this.DATE_IMG_RE.test(url) && /^\/c\/\d+x\d+\/img-master\//.test(pathname) && /\/\d+(?:-[\da-f]{32})?_p\d+_(?:master|square)\d+\./.test(pathname)) {
        pathname = pathname.replace(/^\/c\/\d+x\d+\/img-master\//, '/img-original/').replace(/(\/\d+(?:-[\da-f]{32})?_p\d+)_(?:master|square)\d+\./, '$1.');
      }

      urlObj.pathname = pathname;

      return urlObj.toString();
    },
    isOldIllustPage: function isOldIllustPage(url, doc) {
      if (this.DIR_IMG_RE.test(url)) {
        var pageTitle = doc.title;

        if (doc.querySelector('.introduction form')) {
          var authorNameElm = doc.querySelector('.userdata > .name');

          if (authorNameElm) {
            return pageTitle.endsWith('」イラスト/' + authorNameElm.textContent.trim() + ' [pixiv]');
          }
        }

        return pageTitle.endsWith('のイラスト [pixiv]');
      }

      return false;
    },
    getPageNumber: function getPageNumber(ctx) {
      var _this2 = this;

      var imageURL = ctx.onImage && ctx.target.src || '',
          backgroundImageURL = ctx.hasBGImage && ctx.bgImageURL || '',
          targetURL = ctx.onLink && ctx.link.href || ctx.href || '';

      return (function () {
        var _arr2 = [imageURL, backgroundImageURL, targetURL];

        for (var _i2 = 0; _i2 < _arr2.length; _i2++) {
          var url = _arr2[_i2];
          if (url) {
            var urlObj = new URL(url);

            if (_this2.DIR_IMG_RE.test(url) || _this2.DATE_IMG_RE.test(url)) {
              return url.extract(_this2.DIR_IMG_RE.test(url) ? _this2.DIR_IMG_RE : _this2.DATE_IMG_RE, 2);
            }
            if (_this2.isImagePage(urlObj, 'manga_big')) {
              return urlObj.searchParams.get('page');
            }
          }
        }
      })() || '0';
    },
    fixImageExtensionFromList: function fixImageExtensionFromList(info) {
      var that = this,
          uri = info.imageURL,
          extension = getFileExtension(uri),
          regExtension = new RegExp(extension + '$'),
          extensions = this.IMG_EXTENSIONS.filter(function (candidate) {
        return extension !== candidate;
      });

      return (function recursive() {
        var fileExtension = extensions.shift(),
            imageURL = uri.replace(regExtension, fileExtension);

        return downloadFile(imageURL, {
          referrer: that.REFERRER // useless
        }).then(function () {
          return Object.assign(info, { imageURL: imageURL });
        })['catch'](function () {
          if (extensions.length) {
            return recursive();
          }

          throw new Error(chrome.i18n.getMessage('error_http404'));
        });
      })();
    }
  }, 'Photo');
})();
