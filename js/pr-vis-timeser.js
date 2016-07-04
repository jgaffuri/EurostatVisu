/**
 * 
 * Price statistics time series visualisation
 * 
 * @author julien Gaffuri
 *
 */
(function($, PrVis) {
	$(function() {

		//TODO bug
		//file:///H:/psps/visualisation/WebContent/timeser.html?sel=EU,CP00,EA,CP00,US,CP00&indic=midx&iry=1997&dsl=2002M04,2013M08
		//file:///H:/psps/visualisation/WebContent/timeser.html?sel=EU,CP00,EA,CP00,US,CP00,EA19,CP0111&indic=midx&iry=1997&dsl=2004M06,2011M06
		//when midx and iry and dsl
		//caused by re-referencing

		//TODO default values: zoom on last figures?
		//TODO autocompletion for coicops and countries?
		//TODO pan on time range slide - move range
		//TODO factorise code into a new pr-eurostat-lib.js file
		//TODO on chart, show reference period
		//TODO on click, pan with animation
		//TODO on double click, zoom with animation
		//TODO show data table for on-the-fly download
		//TODO test new Rickshaw.Graph.RangeSlider.Preview
		//https://raw.githubusercontent.com/shutterstock/rickshaw/master/rickshaw.js

		//the dataset - [indic][geo_coicop]
		var dsDict = {};

		//dictionnary for geo names
		var geoDict = {};

		//the default reference year. Should be updated when reference year changes
		var defaultIndexReferenceYear = 2015;

		//the minimum temporal resolution, in seconds by pixel
		var temporalResMin = 40000;



		//GUI components

		//dialog
		var dialog = $("#dialog");

		//graph
		var gDiv = $("#graph");
		var graph = new Rickshaw.Graph({
			element: gDiv.get(0),
			renderer: 'line',
			min:"auto",
			interpolation: $("input:radio[name=interp]:checked").val(),
			series: []
		});
		graph.renderer.strokeWidth = 1.5;

		//redraw graph
		var redrawGraph = function(){
			//erase previous drawing
			gDiv.children("svg").empty();
			var legDiv = $("#legend");
			legDiv.empty();

			//empty series data
			graph.series.length = 0;

			//fill graph data structure
			var selNb = sel.length;
			var colors = colorbrewer["Dark2"][Math.min(Math.max(selNb,3),8)];
			var indic = $("input:radio[name=indic]:checked").val();
			for(var j=0; j<selNb; j++){
				var sel_ = sel[j];
				var ds = dsDict[indic][sel_.geo+"_"+sel_.coicop];
				if(!ds) continue;
				serie = {};
				serie.color = colors[j%8];
				serie.name = ds.Dimension("geo").Category(sel_.geo).label + " - " + PrVis.coicopsDict[sel_.coicop].desc;
				serie.data = [];
				serie.ds = ds; //necessary to show the flags in tooltip
				var months = ds.Dimension("time").Category();
				for(var i=0; i<months.length; i++){
					var month = months[i].label;
					var d = ds.Data({time:month});
					if(!d || d.length || (d.value!=0 && !d.value)) continue;
					serie.data.push({x:PrVis.prMonthToRTime(month),y:d.value});
				}
				graph.series.push(serie);
			}

			graph.render();
			//graph.update();

			highlightBaseLine();

			//build legend
			var legend = new Rickshaw.Graph.Legend( {
				graph: graph,
				element: document.getElementById('legend'),
				naturalOrder:true
			} );

			//change legend style
			legDiv.css("background-color","white");
			$(".label").css("color","black");
			$(".action").css("color","black");
			$(".rickshaw_legend").css("color","black");

			//onhover event for legend elements
			if(sel.length>1){
				new Rickshaw.Graph.Behavior.Series.Toggle( {
					graph: graph,
					legend: legend
				} );
				new Rickshaw.Graph.Behavior.Series.Highlight({
					graph: graph,
					legend: legend
				});
			}

			//add "remove button" to legend elements
			legDiv.children(0).children().each(function(i,el){
				var img = $("<img>")
				.attr("src","img/ico-delete.png")
				.attr("height","13").attr("width","13")
				.attr("title","Remove")
				.click(function(){ removeSelection(i); });
				el = $(el);
				//el.append(img);
				el.children("a").after(img);
				el.children("img").after( $("<span>").text(" ") );
			});

			//ensures URL filed is updated when time range slider changes
			if(!sliR.ovrDone){
				var slideFun = sliR.slider( "option", "slide" );
				sliR.slider( "option", "slide", function(event, ui){
					slideFun(event, ui);
					updateURLTextField();
				} );
				sliR.ovrDone = true;
			}

			//ensures initial range values are loaded
			if(sliR.initVals){
				focusOn(sliR.initVals);
				sliR.initVals = null;
			}

		};


		//launch queries to get new data and redraw graph
		var getGraphData = function(){
			var ajaxs = [];
			var indic = $("input:radio[name=indic]:checked").val();
			if(!dsDict[indic]) dsDict[indic] = {};
			for(var j=0; j<sel.length; j++) {
				if(dsDict[indic][ sel[j].geo+"_"+sel[j].coicop ]) continue;
				var params = { geo:sel[j].geo, coicop:sel[j].coicop };
				if(indic==="midx") params.unit = "I15";
				var ajax = $.ajax({url:EstLib.getEstatDataURL("prc_hicp_"+indic, params )});
				ajax.prSel = sel[j];
				ajaxs.push(ajax);
			}
			if(ajaxs.length>0)
				$.when.apply($, ajaxs)
				.then(function() {
					if(!dsDict[indic]) dsDict[indic] = {};
					for(var j=0; j<sel.length; j++) {
						var key = sel[j].geo+"_"+sel[j].coicop;
						if(dsDict[indic][key]) continue;
						var data = arguments.length==3&&arguments[1]==="success" ? arguments[0] : arguments[j][0];
						EstLib.overrideCountryNames(data.dimension.geo.category.label);
						data = JSONstat(data).Dataset(0);

						//if index and new index reference year, re-reference
						if(indic==="midx" && indRefYearSlid.slider("value")!=defaultIndexReferenceYear)
							PrVis.rereference(data, indRefYearSlid.slider("value"), key);

						dsDict[indic][key] = data;
					}
					redrawGraph();
				}, function() {
					var sel__ = arguments[0].prSel;
					dialog.html("No data available for:<br>Country: "+geoDict[sel__.geo]+"<br>COICOP: "+PrVis.coicopsDict[sel__.coicop].desc);
					dialog.dialog({title: "No data"});
					sel.splice(sel.indexOf(sel__),1);
					//redrawGraph();
				});
			else
				redrawGraph();
		};

		//zoom/pan graph
		var focusOn = function(values){
			sliR.slider("values", values);
			graph.window.xMin = values[0];
			graph.window.xMax = values[1];
			graph.render(); //graph.update();
			updateURLTextField();
			highlightBaseLine();
		};

		var pan = false, xC=0;
		gDiv.mousedown(function(e){
			pan = true;
			xC = e.offsetX;
		});
		gDiv.mouseup(function(){
			pan = false;
			xC = 0;
		});
		gDiv.mousemove(function(e){
			var sv = sliR.slider("values");
			if(!pan) return;
			var dt = xC - e.offsetX; //in pixel screen
			dt = dt / gDiv.width(); //in graph width ratio
			dt = dt*(sv[1]-sv[0]); //in time
			var dom = graph.dataDomain();
			var newV0 = sv[0] + dt;
			if(newV0 < dom[0]) return;
			var newV1 = sv[1] + dt;
			if(newV1 > dom[1]) return;
			if(newV0>=newV1) return; //should not happen.
			focusOn([newV0,newV1]);
			xC = e.offsetX;
		});
		gDiv.mousewheel(function(e) {
			var sv = sliR.slider("values");
			var w = gDiv.width();
			var dt = 0.2 * (sv[1]-sv[0]);
			dt = e.deltaY>0?dt:-dt;
			var r = e.offsetX / w;
			var dom = graph.dataDomain();
			var newV0 = Math.max(dom[0], sv[0] + r*dt);
			var newV1 = Math.min(dom[1], sv[1] - (1-r)*dt);

			//zoom-in threshold, based on temporal resolution
			if( (newV1-newV0)/w < temporalResMin) {
				var mid = 0.5*(sv[0]+sv[1]);
				dt = 0.5*w*temporalResMin;
				newV0 = mid - dt;
				newV1 = mid + dt;
			}

			focusOn([newV0,newV1]);
		});

		//axis
		new Rickshaw.Graph.Axis.Time({ graph: graph });
		new Rickshaw.Graph.Axis.Y({ graph: graph });
		var highlightBaseLine = function(){
			var indic = $("input:radio[name=indic]:checked").val();
			$("text:contains("+(indic==="midx"?100:0)+")").prev().attr("style","stroke:rgb(0,0,0);stroke-width:1;");
		};

		//graph tooltips
		new Rickshaw.Graph.HoverDetail( {
			graph: graph,
			formatter: function(series, x, y) {
				var date = moment(new Date(x * 1000)).format("MMM YYYY");
				var flag = series.ds.Data({time:PrVis.rTimeToPrMonth(x)}).status;
				if(flag === "e") flag = " (estimated)";
				return series.name.replace(" - ","<br>") + "<br>" + date + "<br><b>" + y.toFixed(1) + "</b>" + (flag||"");
			},
			xFormatter : function() { return ""; }
		} );

		//timerange slider - see https://jqueryui.com/slider/#range
		var sliR = $("#timerange");
		new Rickshaw.Graph.RangeSlider( {
			graph: graph,
			element: sliR.get(0)
		} );
		var dsl = PrVis.getParameterByName("dsl");
		if(dsl){
			dsl = dsl.split(",");
			if(dsl.length==2){
				var d0 = +PrVis.prMonthToRTime(dsl[0]);
				var d1 = +PrVis.prMonthToRTime(dsl[1]);
				if(!isNaN(d0)&&!isNaN(d1)&&d0<d1) sliR.initVals = [d0,d1];
			}
		}


		//indicator option
		var indic = PrVis.getParameterByName("indic");
		if(indic) $('input:radio[name=indic][value='+indic+']').attr('checked',true);
		$("input[name='indic']").change(function () {
			if( $("input:radio[name=indic]:checked").val() === "midx" ) indRefYearDiv.show(); else indRefYearDiv.hide();
			getGraphData();
			updateURLTextField();
		});
		$("#indic").buttonset();


		//index reference year slider
		var indRefYearDiv = $("#refYearDiv");
		var indRefYearSlid = $("#refYearSlider");
		var iry = PrVis.getParameterByName("iry");
		indRefYearSlid.slider({
			value: (iry?iry:defaultIndexReferenceYear),
			step: 1,
			slide: function(e,ui){ updateIndexReferenceYear(ui.value); }
		});
		var updateIndexReferenceYear = function(refYearFin){
			$("#refYearTxt").text(refYearFin);

			//compute re-referencing
			for(var dsKey in dsDict.midx) PrVis.rereference(dsDict.midx[dsKey], refYearFin, dsKey);

			//update graph
			redrawGraph();
			updateURLTextField(refYearFin);
		};
		if( $("input:radio[name=indic]:checked").val() === "midx" ) indRefYearDiv.show(); else indRefYearDiv.hide();


		//geos list
		var geoList = $("#geoList");

		//coicops list
		var coicopList = $("#coicopList");
		PrVis.fillCoicopList(coicopList);
		$('#coicopList option[value="CP00"]').attr('selected', 'selected');
		coicopList.selectmenu({
			change : function(){ updateAddRemButtonText(); },
			width:800
		}).selectmenu("menuWidget").css("height","300px");

		//add/remove button
		var sel = PrVis.getParameterByName("sel");
		if(sel){
			var sel_ = sel.split(",");
			sel = [];
			for(var i=0; i<sel_.length; i=i+2) sel.push({geo:sel_[i],coicop:sel_[i+1]});
		} else
			sel = [
			       {geo:"EU",coicop:"CP00"},
			       {geo:"EA",coicop:"CP00"},
			       {geo:"US",coicop:"CP00"}
			       ];
		var removeSelection = function(i){
			sel.splice(i,1);
			updateAddRemButtonText();
			updateURLTextField();
			redrawGraph();
		};
		var addRemButton = $("#addRemB"); //addRemButton.button(); $("button").button();
		addRemButton.click(function(){
			var geoSel = geoList.val();
			var coicopSel = coicopList.val();
			//check if already selected, remove. Otherwise, add.
			for(var j=0; j<sel.length; j++)
				if(geoSel === sel[j].geo && coicopSel === sel[j].coicop) {
					removeSelection(j);
					return;
				}
			sel.push( {geo:geoSel,coicop:coicopSel} );
			updateAddRemButtonText();
			getGraphData();
			updateURLTextField();
		});
		var updateAddRemButtonText = function(){
			//check if already selected
			for(var j=0; j<sel.length; j++)
				if(geoList.val() === sel[j].geo && coicopList.val() === sel[j].coicop) {
					addRemButton.button("option", "label", "Remove from chart");
					return;
				}
			addRemButton.button("option", "label", "Add to chart");
		};
		addRemButton.button();

		//interpolation option
		var interp = PrVis.getParameterByName("interp");
		if(interp) $('input:radio[name=interp][value='+interp+']').attr('checked',true);
		$("input[name='interp']").change(function () {
			graph.interpolation = $("input:radio[name=interp]:checked").val();
			graph.render();
			updateURLTextField();
		});
		$("#interp").buttonset();

		//sharing URL
		var updateURLTextField = function(refYearFin){
			var params = [];

			//sel
			var buf = [];
			for(var i=0; i<sel.length; i++) buf.push(sel[i].geo,sel[i].coicop);
			params.push({p:"sel",v:buf.join(",")});

			//indic
			var indic = $("input:radio[name=indic]:checked").val();
			if(indic != "manr") params.push({p:"indic",v:indic});

			//index reference year
			var iry = refYearFin || indRefYearSlid.slider("value");
			if(iry != defaultIndexReferenceYear) params.push({p:"iry",v:iry});

			//interp
			var interp = $("input:radio[name=interp]:checked").val();
			if(interp != "cardinal") params.push({p:"interp",v:interp});

			//dsl
			var sv = sliR.slider("values");
			if(!isNaN(sv[0]) && !isNaN(sv[1])){
				var dom = graph.dataDomain();
				if(dom[0]!=sv[0] || dom[1]!=sv[1]){
					params.push({p:"dsl",v:PrVis.rTimeToPrMonth(+sv[0])+","+PrVis.rTimeToPrMonth(+sv[1])});
				}
			}

			buf = [];
			for(i=0; i<params.length; i++) buf.push(params[i].p+"="+params[i].v);
			$("#URLtext").val( window.location.origin + window.location.pathname + (buf.length>0?"?"+buf.join("&"):"") );
		};





		//get initial information
		$.when(
				$.ajax({url:EstLib.getEstatDataURL("prc_hicp_manr",{coicop:["CP00","CP01","CP02"],time:["2010M01","2015M01","2016M01","2017M01","2020M01"]})}),
				$.ajax({url:EstLib.getEstatDataURL("prc_hicp_midx",{coicop:["CP00","CP01","CP02"],geo:["EU","EA"]})})
		).then(function(geos, months) {

			//get geo info
			geos = geos[0];
			geoDict = geos.dimension.geo.category.label;
			EstLib.overrideCountryNames(geoDict);
			geos = JSONstat(geos).Dataset(0);
			EstLib.fillGeoList(geoList, geos.Dimension("geo").id, function(geo){return geoDict[geo];});
			geoList.selectmenu({
				change : function(){ updateAddRemButtonText(); },
				width:800
			}).selectmenu("menuWidget").css("height","200px");

			//get time info
			months = months[0];
			months = JSONstat(months).Dataset(0).Dimension("time").id.sort();
			indRefYearSlid.slider("option", "min", +months[0].substring(0,4));
			indRefYearSlid.slider("option", "max", +months[months.length-1].substring(0,4));

			//various updates
			updateAddRemButtonText();
			$("#refYearTxt").text( indRefYearSlid.slider("value") );
			var indic = $("input:radio[name=indic]:checked").val();
			var iry = indRefYearSlid.slider("value");
			if(indic === "midx" && iry != defaultIndexReferenceYear) updateIndexReferenceYear(iry);
			updateURLTextField();

			//first graph refresh
			getGraphData();

		}, function() {
			console.log("Could not retrieve initial information");
		});


	});
}(jQuery, window.PrVis = window.PrVis || {} ));
