require('dotenv').config()
var express = require("express");
var router  = express.Router();
var Campground = require("../models/campground");
var middleware = require("../middleware");
var NodeGeocoder = require('node-geocoder');
var multer = require('multer');
var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'cloudname', 
  api_key: apikeyhere, 
  api_secret: "apisecretkeyhere",
});
 
var options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: "apikeyhere",
  formatter: null
};
 
var geocoder = NodeGeocoder(options);


//INDEX - show all campgrounds
router.get("/", function(req, res){
    var noMatch = null;
    if(req.query.search) {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
        // Get all campgrounds from DB
        Campground.find({name: regex}, function(err, allCampgrounds){
           if(err){
               console.log(err);
           } else {
              if(allCampgrounds.length < 1) {
                  noMatch = "No campgrounds match that query, please try again.";
              }
              res.render("campgrounds/index",{campgrounds:allCampgrounds, noMatch: noMatch});
           }
        });
    } else {
        // Get all campgrounds from DB
        Campground.find({}, function(err, allCampgrounds){
           if(err){
               console.log(err);
           } else {
              res.render("campgrounds/index",{campgrounds:allCampgrounds, noMatch: noMatch});
           }
        });
    }
});

//CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), function(req, res) {
    geocoder.geocode(req.body.location, function (err, data) {
        if (err || !data.length) {
            req.flash('error', 'Invalid address');
            return res.redirect('/campgrounds');
        }
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;
        var name = req.body.campground.name;
        var cost = req.body.campground.cost;
        var desc = req.body.campground.description; 
        var author = {
            id: req.user._id,
            username: req.user.username
        }
        cloudinary.uploader.upload(req.file.path, function(result) {
            // console.log(result);
            var image = result.secure_url; // add image URL
            var imageId = result.public_id; // add public id
            var newCampground = {name: name, image: image, imageId: imageId, cost: cost, description: desc, author:author, location: location, lat: lat, lng: lng};
            Campground.create(newCampground, function(err, newlyCreated){
                if(err){
                    console.log(err);
                    req.flash("error", err.message);
                    return res.redirect("/campgrounds");
                } else {
                    req.flash("success","Successfully created campground");
                    res.redirect("/campgrounds");
                }
            });
        });
    });
});

//NEW - show form to create new campground
router.get("/new", middleware.isLoggedIn, function(req, res){
   res.render("campgrounds/new"); 
});

// SHOW - shows more info about one campground
router.get("/:id", function(req, res){
    //find the campground with provided ID
    Campground.findById(req.params.id).populate("comments").exec(function(err, foundCampground){
        if(err){
            console.log(err);
        } else {
            console.log(foundCampground)
            //render show template with that campground
            res.render("campgrounds/show", {campground: foundCampground});
        }
    });
});

// EDIT CAMPGROUND ROUTE
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res){
    Campground.findById(req.params.id, function(err, foundCampground){
        res.render("campgrounds/edit", {campground: foundCampground});
    });
});

// UPDATE CAMPGROUND ROUTE
router.put("/:id", middleware.isLoggedIn, middleware.checkCampgroundOwnership, upload.single("image"),function(req, res){
    geocoder.geocode(req.body.location, function(err, data) {
        if (err || !data.length) {
          req.flash('error', 'Invalid address');
          return res.redirect('/campgrounds');
        } else {
            Campground.findById(req.params.id,async function(err, campground) {
                if(err) {
                    req.flash("error", err.message);
                    return res.redirect("back");
                } else {
                    if(req.file) {
                        try {
                            await cloudinary.v2.uploader.destroy(campground.imageId);
                            var result = await cloudinary.v2.uploader.upload(req.file.path);
                            campground.image = result.secure_url;
                            campground.imageId = result.public_id;
                        } catch(err) {
                            req.flash("error", err.message);
                            return res.redirect("back");
                        }
                    }    
                    campground.lat = data[0].latitude;
                    campground.lng = data[0].longitude;
                    campground.location = data[0].formattedAddress;
                    campground.description = req.body.campground.description;
                    campground.name = req.body.campground.name;
                    campground.cost = req.body.campground.cost;
                    campground.save();
 
                    req.flash("success","Successfully updated campground");
                    res.redirect("/campgrounds/" + campground._id);
                }    
            });
        }
    });
});



// DESTROY CAMPGROUND ROUTE
router.delete("/:id",middleware.checkCampgroundOwnership, function(req, res){
   Campground.findByIdAndRemove(req.params.id, function(err){
      if(err){
          res.redirect("/campgrounds");
      } else {
          res.redirect("/campgrounds");
      }
   });
});


function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};


module.exports = router;
