// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  var HINT_ELEMENT_CLASS        = "CodeMirror-hint";
  var ACTIVE_HINT_ELEMENT_CLASS = "CodeMirror-hint-active";

  // This is the old interface, kept around for now to stay
  // backwards-compatible.
  CodeMirror.showHint = function(cm, getHints, options) {
    if (!getHints) return cm.showHint(options);
    if (options && options.async) getHints.async = true;
    var newOpts = {hint: getHints};
    if (options) for (var prop in options) newOpts[prop] = options[prop];
    return cm.showHint(newOpts);
  };

  CodeMirror.defineExtension("showHint", function(options) {
    options = parseOptions(this, this.getCursor("start"), options);
    var selections = this.listSelections()
    if (selections.length > 1) return;
    // By default, don't allow completion when something is selected.
    // A hint function can have a `supportsSelection` property to
    // indicate that it can handle selections.
    if (this.somethingSelected()) {
      if (!options.hint.supportsSelection) return;
      // Don't try with cross-line selections
      for (var i = 0; i < selections.length; i++)
        if (selections[i].head.line != selections[i].anchor.line) return;
    }

    if (this.state.completionActive) this.state.completionActive.close();
    var completion = this.state.completionActive = new Completion(this, options);
    if (!completion.options.hint) return;

    CodeMirror.signal(this, "startCompletion", this);
    completion.update(true);
  });

  function Completion(cm, options) {
    this.cm = cm;
    this.options = options;
    this.widget = null;
    this.debounce = 0;
    this.tick = 0;
    this.startPos = this.cm.getCursor("start");
    this.startLen = this.cm.getLine(this.startPos.line).length - this.cm.getSelection().length;

    var self = this;
    cm.on("cursorActivity", this.activityFunc = function() { self.cursorActivity(); });
  }

  var requestAnimationFrame = window.requestAnimationFrame || function(fn) {
    return setTimeout(fn, 1000/60);
  };
  var cancelAnimationFrame = window.cancelAnimationFrame || clearTimeout;

  Completion.prototype = {
    close: function() {
      if (!this.active()) return;
      this.cm.state.completionActive = null;
      this.tick = null;
      this.cm.off("cursorActivity", this.activityFunc);

      if (this.widget && this.data) CodeMirror.signal(this.data, "close");
      if (this.widget) this.widget.close();
      CodeMirror.signal(this.cm, "endCompletion", this.cm);
    },

    active: function() {
      return this.cm.state.completionActive == this;
    },

    pick: function(data, i) {
      var completion = data.list[i];
      if (completion.hint) completion.hint(this.cm, data, completion);
      else {
        var _data;
        var node = this.widget.hints.childNodes[this.widget.selectedHint];
        if (node._insertCode) {
          _data = node._insertCode;
        } else
          _data = getText(completion);
        //editor.getLine();
        var _line = this.cm.getLine(data.from.line),
          _char = _line[data.from.ch];
        //alert(data.from.ch);
        if (_char == '\"' || _char == '\'') {
          if (top.stringValueInput && top.stringValueInput != "")
            data.from.ch = _line.indexOf(top.stringValueInput);
          else
            data.from.ch = this.cm.getCursor().ch;
        }
        this.cm.replaceRange(_data, completion.from || data.from,
          completion.to || data.to, "complete");
      }

      CodeMirror.signal(data, "pick", completion);
      this.close();
    },

    cursorActivity: function() {
      if (this.debounce) {
        cancelAnimationFrame(this.debounce);
        this.debounce = 0;
      }

      var pos = this.cm.getCursor(), line = this.cm.getLine(pos.line);
      if (pos.line != this.startPos.line || line.length - pos.ch != this.startLen - this.startPos.ch ||
          pos.ch < this.startPos.ch || this.cm.somethingSelected() ||
          (pos.ch && this.options.closeCharacters.test(line.charAt(pos.ch - 1)))) {
        this.close();
      } else {
        var self = this;
        this.debounce = requestAnimationFrame(function() {self.update();});
        if (this.widget) this.widget.disable();
      }
    },

    update: function(first) {
      if (this.tick == null) return
      var self = this, myTick = ++this.tick
      fetchHints(this.options.hint, this.cm, this.options, function(data) {
        if (self.tick == myTick) self.finishUpdate(data, first)
      })
    },

    finishUpdate: function(data, first) {
      if (this.data) CodeMirror.signal(this.data, "update");
      if (data && this.data) {
        //debugger;
        top._tttt += "," + this.cm.getLine(data.from.line) + "#" + this.data.from.ch + "#" + this.data.to.ch + "#" + data.from.ch + "#" + data.to.ch;
        /*
          if (data.to.ch == this.data.to.ch + 1 && 
          (this.cm.getLine(data.from.line)[this.data.to.ch] == '[' || 
          this.cm.getLine(data.from.line)[this.data.to.ch] == ':')){
            ;
          }
          else
          */
        if (data.to.ch == this.data.to.ch + 1)
          data.from.ch = this.data.from.ch;
        if (CodeMirror.cmpPos(data.from, this.data.from))
          data = null;


        //if (CodeMirror.cmpPos(data.from, this.data.from))

      }

      var picked = (this.widget && this.widget.picked) || (first && this.options.completeSingle);
      if (this.widget) this.widget.close();

      this.data = data;

      if (data && data.list.length) {
       // if (picked && data.list.length == 1) {
       //  this.pick(data, 0);
       // } else {
          this.widget = new Widget(this, data);
          CodeMirror.signal(data, "shown");
       // }
      }
    }
  };

  function parseOptions(cm, pos, options) {
    var editor = cm.options.hintOptions;
    var out = {};
    for (var prop in defaultOptions) out[prop] = defaultOptions[prop];
    if (editor) for (var prop in editor)
      if (editor[prop] !== undefined) out[prop] = editor[prop];
    if (options) for (var prop in options)
      if (options[prop] !== undefined) out[prop] = options[prop];
    if (out.hint.resolve) out.hint = out.hint.resolve(cm, pos)
    return out;
  }

  function getText(completion) {
    if (typeof completion == "string") return completion;
    else return completion.text;
  }

  function buildKeyMap(completion, handle) {
    var baseMap = {
      Up: function() {handle.moveFocus(-1);},
      Down: function() {handle.moveFocus(1);},
      PageUp: function() {handle.moveFocus(-handle.menuSize() + 1, true);},
      PageDown: function() {handle.moveFocus(handle.menuSize() - 1, true);},
      Home: function() {handle.setFocus(0);},
      End: function() {handle.setFocus(handle.length - 1);},
      Enter: handle.pick,
      Tab: handle.pick,
      Esc: handle.close
    };
    var custom = completion.options.customKeys;
    var ourMap = custom ? {} : baseMap;
    function addBinding(key, val) {
      var bound;
      if (typeof val != "string")
        bound = function(cm) { return val(cm, handle); };
      // This mechanism is deprecated
      else if (baseMap.hasOwnProperty(val))
        bound = baseMap[val];
      else
        bound = val;
      ourMap[key] = bound;
    }
    if (custom)
      for (var key in custom) if (custom.hasOwnProperty(key))
        addBinding(key, custom[key]);
    var extra = completion.options.extraKeys;
    if (extra)
      for (var key in extra) if (extra.hasOwnProperty(key))
        addBinding(key, extra[key]);
    return ourMap;
  }

  function getHintElement(hintsElement, el) {
    while (el && el != hintsElement) {
      if (el.nodeName.toUpperCase() === "LI" && el.parentNode == hintsElement) return el;
      el = el.parentNode;
    }
  }

  function Widget(completion, data) {
    this.completion = completion;
    this.data = data;
    this.picked = false;
    var widget = this, cm = completion.cm;

    var hints = this.hints = document.createElement("ul");
    hints.className = "CodeMirror-hints";
    this.selectedHint = data.selectedHint || 0;

    var completions = data.list;
    for (var i = 0; i < completions.length; ++i) {
      var elt = hints.appendChild(document.createElement("li")), cur = completions[i];
      var className = HINT_ELEMENT_CLASS + (i != this.selectedHint ? "" : " " + ACTIVE_HINT_ELEMENT_CLASS);
      if (cur.className != null) className = cur.className + " " + className;
      elt.className = className;
      if (cur.render) cur.render(elt, data, cur);
      else {
        var _text, img_notes = null;
        if (cur.displayText)
          _text = cur.displayText;
        else {
          _text = getText(cur);
          var _type_index = 0,
            _title = elt.appendChild(document.createElement("span")),
            _title_tips = ["[系统原生]", "[平台方法]", "[全局变量]", "[代码模板]", "", "[字符资源]"],
            img = elt.appendChild(document.createElement("img")),
            img_src = ["/Sys/FrameWork/Common/Images/Toolbar/icon_fileFromWeb_over.gif",
              "/Sys/FrameWork/Common/Images/function.gif",
              "/Sys/FrameWork/Common/Images/icon/navigator.gif",
              "/Sys/FrameWork/Common/Images/icon32/type/js.gif",
              //"/Sys/FrameWork/Common/Images/Toolbar/icon_project.gif",
              "/Sys/FrameWork/Common/Images/function.gif",
              "/Sys/FrameWork/Common/Images/icon32/type/js.gif"
            ];
          $(_title).css({
            "font-size": "12px",
            "font-weight": "bold",
            "margin-right": "3px"
          });
          $(img).css({
            "margin-top": "0px",
            "margin-right": "3px",
            "vertical-align": "middle",
            "width": "18px",
            "height": "16px"
          });

          if (_language == "csharp") {
            _title_tips = ["[公共方法]", "[公共属性]", "[类型定义]", "[命名空间]", "[模板代码]", "[成员变量]", "[局部变量]"];
            img_src = ["/Sys/FrameWork/Common/Images/icon/function.png",
              "/Sys/FrameWork/Common/Images/icon/parameter.png",
              "/Sys/FrameWork/Common/Images/icon/class.png",
              "/Sys/FrameWork/Common/Images/icon/namespace.png",
              //"/Sys/FrameWork/Common/Images/Toolbar/icon_project.gif",
              "/Sys/FrameWork/Common/Images/icon/navigator.gif",
              "/Sys/FrameWork/Common/Images/icon/field.png",
              "/Sys/FrameWork/Common/Images/icon/field.png"
            ];
          }


          if (_text.indexOf(":") > -1 && _text.indexOf(":") != _text.lastIndexOf(":")) {
            var item = _text.split(':'),
              item0 = unescape(item[0]).trim(),
              item1 = unescape(item[1]).trim(),
              item2 = unescape(item[2]).trim(),
              _type_index = parseInt(item2);
            if (_language == "csharp") {
              var _remarks = item[3].split(';'),
                remark = unescape(_remarks[0]).trim();
              //item2 = unescape(item[3]).trim(),
              _text = item0 + (remark == "" ? "" : "【说明】" + remark);
              elt._insertCode = item1;
              if (_remarks.length > 1) {

                img_notes = document.createElement("img");
                img_notes.src = "/Sys/FrameWork/Common/Images/function.gif";
                img_notes._text = _remarks;
                $(img_notes).css({
                  "margin-top": "0",
                  "margin-right": "0",
                  //"vertical-align": "middle",
                  "width": "16px",
                  "height": "16px",
                  //"float": "right",
                  "position": "absolute",
                  "top": "0",
                  "right": "0"
                }).mouseup(function() {
                  var str = "参数列表：";
                  for (var i = 1; i < this._text.length; i++) {
                    str += "\r\n\r\n" + unescape(this._text[i]).trim();
                  }
                  alert(str);
                  //alert(this.parentElement.outerHTML);
                });
              }
            } else {
              if (item2 == "1") { // 平台方法
                //_text = item0 + (item1 == "" ? "" : "  【"+item1+"】");
                _text = item1;
                elt._insertCode = item0;
              } else {
                _text = item0;
                elt._insertCode = item1;
              }
              /*
              else if (item2 == "2") {  // 全局变量
                //_text = item0 + (item1 == "" ? "" : "  【"+ item1 +"】");
                elt._insertCode = item0;
              }
              else if (item2 == "3") {  // 代码片段
                //_text = item0;
                elt._insertCode = item1;
              }
              else if (item2 == "4")  { // 成员方法
                //_text = item0 + (item1 == "" ? "" : "  【"+ item1 +"】");
                elt._insertCode = item0;
              }
              */
            }
          } else {
            elt._insertCode = _text;
            _text = _text;
          }

          img.src = img_src[_type_index];
          _title.innerText = _title_tips[_type_index];
        }

        elt.appendChild(document.createTextNode(_text));
        if (img_notes != null)
          elt.appendChild(img_notes);
      }
      elt.hintId = i;
    }

    var pos = cm.cursorCoords(completion.options.alignWithWord ? data.from : null);
    var left = pos.left, top = pos.bottom, below = true;
    hints.style.left = left + "px";
    hints.style.top = top + "px";
    // If we're at the edge of the screen, then we want the menu to appear on the left of the cursor.
    var winW = window.innerWidth || Math.max(document.body.offsetWidth, document.documentElement.offsetWidth);
    var winH = window.innerHeight || Math.max(document.body.offsetHeight, document.documentElement.offsetHeight);
    (completion.options.container || document.body).appendChild(hints);
    
    ///{{{ 修改开始
    var widtha = $(".CodeMirror-hints").width(), widthb = $(window).width();
    if (widthb - 50 < widtha)
	     $(".CodeMirror-hints").css("width", widthb-50);
    ///修改结束}}} 	     
    var box = hints.getBoundingClientRect(), overlapY = box.bottom - winH;
    var scrolls = hints.scrollHeight > hints.clientHeight + 1
    var startScroll = cm.getScrollInfo();

    if (overlapY > 0) {
      var height = box.bottom - box.top, curTop = pos.top - (pos.bottom - box.top);
      if (curTop - height > 0) { // Fits above cursor
        hints.style.top = (top = pos.top - height) + "px";
        below = false;
      } else if (height > winH) {
        hints.style.height = (winH - 5) + "px";
        hints.style.top = (top = pos.bottom - box.top) + "px";
        var cursor = cm.getCursor();
        if (data.from.ch != cursor.ch) {
          pos = cm.cursorCoords(cursor);
          hints.style.left = (left = pos.left) + "px";
          box = hints.getBoundingClientRect();
        }
      }
    }
    var overlapX = box.right - winW;
    if (overlapX > 0) {
      if (box.right - box.left > winW) {
        hints.style.width = (winW - 5) + "px";
        overlapX -= (box.right - box.left) - winW;
      }
      hints.style.left = (left = pos.left - overlapX) + "px";
    }
    if (scrolls) for (var node = hints.firstChild; node; node = node.nextSibling)
      node.style.paddingRight = cm.display.nativeBarWidth + "px"

    cm.addKeyMap(this.keyMap = buildKeyMap(completion, {
      moveFocus: function(n, avoidWrap) { widget.changeActive(widget.selectedHint + n, avoidWrap); },
      setFocus: function(n) { widget.changeActive(n); },
      menuSize: function() { return widget.screenAmount(); },
      length: completions.length,
      close: function() { completion.close(); },
      pick: function() { widget.pick(); },
      data: data
    }));

    if (completion.options.closeOnUnfocus) {
      var closingOnBlur;
      cm.on("blur", this.onBlur = function() { closingOnBlur = setTimeout(function() { completion.close(); }, 100); });
      cm.on("focus", this.onFocus = function() { clearTimeout(closingOnBlur); });
    }

    cm.on("scroll", this.onScroll = function() {
      var curScroll = cm.getScrollInfo(), editor = cm.getWrapperElement().getBoundingClientRect();
      var newTop = top + startScroll.top - curScroll.top;
      var point = newTop - (window.pageYOffset || (document.documentElement || document.body).scrollTop);
      if (!below) point += hints.offsetHeight;
      if (point <= editor.top || point >= editor.bottom) return completion.close();
      hints.style.top = newTop + "px";
      hints.style.left = (left + startScroll.left - curScroll.left) + "px";
    });

    CodeMirror.on(hints, "dblclick", function(e) {
      var t = getHintElement(hints, e.target || e.srcElement);
      if (t && t.hintId != null) {widget.changeActive(t.hintId); widget.pick();}
    });

    CodeMirror.on(hints, "click", function(e) {
      var t = getHintElement(hints, e.target || e.srcElement);
      if (t && t.hintId != null) {
        widget.changeActive(t.hintId);
        if (completion.options.completeOnSingleClick) widget.pick();
      }
    });

    CodeMirror.on(hints, "mousedown", function() {
      setTimeout(function(){cm.focus();}, 20);
    });

    CodeMirror.signal(data, "select", completions[this.selectedHint], hints.childNodes[this.selectedHint]);
    return true;
  }

  Widget.prototype = {
    close: function() {
      if (this.completion.widget != this) return;
      this.completion.widget = null;
      this.hints.parentNode.removeChild(this.hints);
      this.completion.cm.removeKeyMap(this.keyMap);

      var cm = this.completion.cm;
      if (this.completion.options.closeOnUnfocus) {
        cm.off("blur", this.onBlur);
        cm.off("focus", this.onFocus);
      }
      cm.off("scroll", this.onScroll);
    },

    disable: function() {
      this.completion.cm.removeKeyMap(this.keyMap);
      var widget = this;
      this.keyMap = {Enter: function() { widget.picked = true; }};
      this.completion.cm.addKeyMap(this.keyMap);
    },

    pick: function() {
      this.completion.pick(this.data, this.selectedHint);
    },

    changeActive: function(i, avoidWrap) {
      if (i >= this.data.list.length)
        i = avoidWrap ? this.data.list.length - 1 : 0;
      else if (i < 0)
        i = avoidWrap ? 0  : this.data.list.length - 1;
      if (this.selectedHint == i) return;
      var node = this.hints.childNodes[this.selectedHint];
      node.className = node.className.replace(" " + ACTIVE_HINT_ELEMENT_CLASS, "");
      node = this.hints.childNodes[this.selectedHint = i];
      node.className += " " + ACTIVE_HINT_ELEMENT_CLASS;
      if (node.offsetTop < this.hints.scrollTop)
        this.hints.scrollTop = node.offsetTop - 3;
      else if (node.offsetTop + node.offsetHeight > this.hints.scrollTop + this.hints.clientHeight)
        this.hints.scrollTop = node.offsetTop + node.offsetHeight - this.hints.clientHeight + 3;
      CodeMirror.signal(this.data, "select", this.data.list[this.selectedHint], node);
    },

    screenAmount: function() {
      return Math.floor(this.hints.clientHeight / this.hints.firstChild.offsetHeight) || 1;
    }
  };

  function applicableHelpers(cm, helpers) {
    if (!cm.somethingSelected()) return helpers
    var result = []
    for (var i = 0; i < helpers.length; i++)
      if (helpers[i].supportsSelection) result.push(helpers[i])
    return result
  }

  function fetchHints(hint, cm, options, callback) {
    if (hint.async) {
      hint(cm, callback, options)
    } else {
      var result = hint(cm, options)
      if (result && result.then) result.then(callback)
      else callback(result)
    }
  }

  function resolveAutoHints(cm, pos) {
    var helpers = cm.getHelpers(pos, "hint"), words
    if (helpers.length) {
      var resolved = function(cm, callback, options) {
        var app = applicableHelpers(cm, helpers);
        function run(i) {
          if (i == app.length) return callback(null)
          fetchHints(app[i], cm, options, function(result) {
            if (result && result.list.length > 0) callback(result)
            else run(i + 1)
          })
        }
        run(0)
      }
      resolved.async = true
      resolved.supportsSelection = true
      return resolved
    } else if (words = cm.getHelper(cm.getCursor(), "hintWords")) {
      return function(cm) { return CodeMirror.hint.fromList(cm, {words: words}) }
    } else if (CodeMirror.hint.anyword) {
      return function(cm, options) { return CodeMirror.hint.anyword(cm, options) }
    } else {
      return function() {}
    }
  }

  CodeMirror.registerHelper("hint", "auto", {
    resolve: resolveAutoHints
  });

  CodeMirror.registerHelper("hint", "fromList", function(cm, options) {
    var cur = cm.getCursor(), token = cm.getTokenAt(cur);
    var to = CodeMirror.Pos(cur.line, token.end);
    if (token.string && /\w/.test(token.string[token.string.length - 1])) {
      var term = token.string, from = CodeMirror.Pos(cur.line, token.start);
    } else {
      var term = "", from = to;
    }
    var found = [];
    for (var i = 0; i < options.words.length; i++) {
      var word = options.words[i];
      if (word.slice(0, term.length) == term)
        found.push(word);
    }

    if (found.length) return {list: found, from: from, to: to};
  });

  CodeMirror.commands.autocomplete = CodeMirror.showHint;

  var defaultOptions = {
    hint: CodeMirror.hint.auto,
    completeSingle: true,
    alignWithWord: true,
    //closeCharacters: /[\s()\[\]{};:>,]/,
    closeCharacters: /[;>,]/,
    closeOnUnfocus: true,
    completeOnSingleClick: true,
    container: null,
    customKeys: null,
    extraKeys: null
  };

  CodeMirror.defineOption("hintOptions", null);
});
