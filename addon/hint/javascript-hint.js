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
  var Pos = CodeMirror.Pos;

  function forEach(arr, f) {
    for (var i = 0, e = arr.length; i < e; ++i) f(arr[i]);
  }

  function arrayContains(arr, item) {
    if (!Array.prototype.indexOf) {
      var i = arr.length;
      while (i--) {
        if (arr[i] === item) {
          return true;
        }
      }
      return false;
    }
    return arr.indexOf(item) != -1;
  }

  function scriptHint(editor, keywords, getToken, options) {
    // Find the token at the cursor
    var cur = editor.getCursor(), token = getToken(editor, cur);
    //if (/\b(?:string|comment)\b/.test(token.type)) return;
	if (/\b(?:string)\b/.test(token.type)) {
		top.wesoftInputStringType = true;
		if (top.wesoftIsPressKey && token.string.indexOf("$") == -1){
			top.stringValueLeft = token.string.substring(1, cur.ch - token.start);
			top.stringValueRight = token.string.length > cur.ch ? token.string.substring(cur.ch + 1) : "";
			token.string = ""; //token.string.replace(/\"/g, "");
		}
		else{
			token.string = token.string.substring(top.stringValueLeft.length + 1);
			token.string = token.string.substring(0, token.string.lastIndexOf(top.stringValueRight) - 1);
			top.stringValueInput = token.string;
			//alert(token.string)
		}
	}
	else
	{		
		top.stringValueRight = "";
		top.stringValueLeft = "";
		top.stringValueInput = "";
		top.wesoftInputStringType = false;
	}
    var innerMode = CodeMirror.innerMode(editor.getMode(), token.state);
    if (innerMode.mode.helperType === "json") return;
    token.state = innerMode.state;
    if (token.string == ".")
	top.wesoftClickChar = ".";
    else
	top.wesoftClickChar = "";
    // If it's not a 'word-style' token, ignore the token.
    if (!/^[\w$_]*$/.test(token.string)) {
      token = {start: cur.ch, end: cur.ch, string: "", state: token.state,
               type: token.string == "." ? "property" : null};
    } else if (token.end > cur.ch) {
      token.end = cur.ch;
      token.string = token.string.slice(0, cur.ch - token.start);
    }

    var tprop = token;
    // If it is a property, find out what it is a property of.
    while (tprop.type == "property") {
      tprop = getToken(editor, Pos(cur.line, tprop.start));
      if (tprop.string != ".") return;
      tprop = getToken(editor, Pos(cur.line, tprop.start));
      if (!context) var context = [];
      context.push(tprop);
    }
    return {list: getCompletions(token, context, keywords, options, false, editor.getLine(cur.line).substring(0, cur.ch)),
            from: Pos(cur.line, token.start),
            to: Pos(cur.line, token.end)};
  }

  function javascriptHint(editor, options) {
    return scriptHint(editor, javascriptKeywords,
                      function (e, cur) {return e.getTokenAt(cur);},
                      options);
  };
  CodeMirror.registerHelper("hint", "javascript", javascriptHint);

  function getCoffeeScriptToken(editor, cur) {
  // This getToken, it is for coffeescript, imitates the behavior of
  // getTokenAt method in javascript.js, that is, returning "property"
  // type and treat "." as indepenent token.
    var token = editor.getTokenAt(cur);
    if (cur.ch == token.start + 1 && token.string.charAt(0) == '.') {
      token.end = token.start;
      token.string = '.';
      token.type = "property";
    }
    else if (/^\.[\w$_]*$/.test(token.string)) {
      token.type = "property";
      token.start++;
      token.string = token.string.replace(/\./, '');
    }
    return token;
  }

  function coffeescriptHint(editor, options) {
    return scriptHint(editor, coffeescriptKeywords, getCoffeeScriptToken, options);
  }
  CodeMirror.registerHelper("hint", "coffeescript", coffeescriptHint);

  var stringProps = ("charAt charCodeAt indexOf lastIndexOf substring substr slice trim trimLeft trimRight " +
                     "toUpperCase toLowerCase split concat match replace search").split(" ");
  var arrayProps = ("length concat join splice push pop shift unshift slice reverse sort indexOf " +
                    "lastIndexOf every some filter forEach map reduce reduceRight ").split(" ");
  var funcProps = "prototype apply call bind".split(" ");
  var javascriptKeywords = ("break case catch class const continue debugger default delete do else export extends false finally for function " +
                  "if in import instanceof new null return super switch this throw true try typeof var void while with yield").split(" ");
  var coffeescriptKeywords = ("and break catch class continue delete do else extends false finally for " +
                  "if in instanceof isnt new no not null of off on or return switch then throw true try typeof until void while with yes").split(" ");

  function forAllProps(obj, callback) {
    if (!Object.getOwnPropertyNames || !Object.getPrototypeOf) {
      for (var name in obj) callback(name)
    } else {
      for (var o = obj; o; o = Object.getPrototypeOf(o))
        Object.getOwnPropertyNames(o).forEach(callback)
    }
  }

  function getCompletions(token, context, keywords, options, showAll, prevChars) {
    keywords = [];
    var found = [], start = token.string, global = editor.options.globalScope || options && options.globalScope || window, showGlobal = false;
    function maybeAdd(str) {
	   if ((start == "" || start == ".") && !arrayContains(found, str)) 
	   {
		   found.push(str); 
		   return;
	   }
	  if (str.indexOf("_") == 0) return;
	  var sourceStr = str;
	  //if (start == "$:")
		  //alert(str);
	  str = unescape(str).trim();
	  //if (str.indexOf("$:a") == 0)
		  //top._tttt += "," + str;
	  if (str.toLowerCase().indexOf(start.toLowerCase(), 0) == 0 && !arrayContains(found, sourceStr)) found.push(sourceStr);
	  else if (showAll && !arrayContains(found, sourceStr)) found.push(sourceStr);
    }
    function gatherCompletions(obj) {
      if (typeof obj == "string") forEach(stringProps, maybeAdd);
      else if (obj instanceof Array) forEach(arrayProps, maybeAdd);
      else if (obj instanceof Function) forEach(funcProps, maybeAdd);
      forAllProps(obj, maybeAdd)
    }

    if (context && context.length) {
      // If this is a property, see if it belongs to some object we can
      // find in the current environment.
      var obj = context.pop(), base;
      if ((obj.type && obj.type.indexOf("variable") === 0) || (obj.string == ")" && obj.type == null)) {
        if (options && options.additionalContext)
          base = options.additionalContext[obj.string];
        if (!options || options.useGlobalScope !== false)
        {
          base = base || global[obj.string];
	  if (base == undefined)
	  {
		  showGlobal = true;
		  //forEach(stringProps, maybeAdd);
	  }
	}
      } else if (obj.type == "string") {
        base = "";
      } else if (obj.type == "atom") {
        base = 1;
      } else if (obj.type == "function") {
        if (global.jQuery != null && (obj.string == '$' || obj.string == 'jQuery') &&
            (typeof global.jQuery == 'function'))
          base = global.jQuery();
        else if (global._ != null && (obj.string == '_') && (typeof global._ == 'function'))
          base = global._();
      }
      else if (top.wesoftClickChar == ".")
	  showGlobal = true;
      while (base != null && context.length)
        base = base[context.pop().string];
      if (base != null) gatherCompletions(base);
    } else {
      // If not, just look in the global object and any local scope
      // (reading into JS mode internals to get at the local and global variables)
      //for (var v = token.state.localVars; v; v = v.next) maybeAdd(v.name);
      //for (var v = token.state.globalVars; v; v = v.next) maybeAdd(v.name);
      if (!options || options.useGlobalScope !== false)
        gatherCompletions(global);
      forEach(keywords, maybeAdd);
    }
    if (_language == "csharp") {
      if (typeof(CSharpCodeGenerator) == "function") {
        //debugger;
        if (token.type != "string" && prevChars != undefined) {
          prevChars = prevChars.trim();
          if (prevChars.lastIndexOf(";") >= 0)
            prevChars = prevChars.substring(prevChars.lastIndexOf(";")).replace(";", "").trim();

          /*
          var _prevChars = prevChars;
          var lastIndex = _prevChars.lastIndexOf('=');
          if (lastIndex > 0){
            _prevChars = _prevChars.substring(lastIndex).replace("=", "").trim();
          }
        
          if (_prevChars == "new"){
            var index1 = prevChars.lastIndexOf("new"),
            index2 = prevChars.lastIndexOf("=");
            if (index1 > index2){
              _prevChars = prevChars.substring(0, index2 - 1).trim();
              _prevChars = _prevChars.split(' ')[0];
            }
            start = _prevChars;
            var startLastIndex = start.lastIndexOf(".");
            if (startLastIndex >= 0 && startLastIndex + 1 != start.length){
              start = start.substring(startLastIndex + 1);
            }
            //alert(start)
          }
          */
          //alert(prevChars);
          prevChars = prevChars.replace("return ", "").trim();
          var res = CSharpCodeGenerator(prevChars);
          if (res != "") {
            res = res.split(",");
            for (var i = 0; i < res.length; i++) {
              var items = res[i].split(':');
              if (items[2] == 0 || items[2] == 1 || items[2] == 5) {
                if (items[1].trim().length < 4) {
                  continue;
                }
              }
              //alert(items[1].trim())

              maybeAdd(res[i]);
            }
          }
        }
      }
    } else {
      if (typeof(JsCodeGenerator) == "function") {
        if (CodeMirror.JsCodeGenerator == undefined) {
          CodeMirror.JsCodeGenerator = JsCodeGenerator();
        }

        if (CodeMirror.JsCodeGenerator != "") {
          var res = CodeMirror.JsCodeGenerator.split(',');
          for (var i = 0; i < res.length; i++) {
            var items = res[i].split(':');
            if (showGlobal && items[2] == "4") {
              maybeAdd(items[0] + ":" + items[1] + ":" + items[2]);
            } else if (!showGlobal && items[2] != "4") {
              if (top.wesoftInputStringType) {
                if (items[2] != "5")
                  continue;
              } else
              if (items[2] == "5") continue;
              //if (items[2] == "4")
              //if (items[2] == "2") alert(items[0]);
              //if (items[0].indexOf("function") >= 0) alert(res[i]);
              maybeAdd(items[0] + ":" + items[1] + ":" + items[2]);
            }
          }
        }
      }
    }
    if (top.wesoftIsPressKey && !showAll && found.length == 0) {
      return getCompletions(token, context, keywords, options, true);
    }
    return found.sort(function(a, b) {
      return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
    });
  }

});
