var Q       = require('q'),
    project = require('../src/project');

describe('project', function() {
    it('get cordova project', function() {
        
		var p, error;

		try {
			p = new project.cordova();
			expect("").toBe("Exception should have been thrown");
		} catch (e){}


		p = new project.cordova("projects/android_install", "plugins");
		expect(p.platform).toBe("");
    });
	
    it('get android project', function() {

		var p = project.forPlatform("android", "projects/android_one", "plugins");
		expect(p.platform).toBe("android");
    });	
	
	
    it('get ios project', function() {

		var p = project.forPlatform("ios", "projects/ios-plist", "plugins");
		expect(p.platform).toBe("ios");
    });	

	
    it('get windows8 project', function() {

		var p = project.forPlatform("windows8", "projects/windows8", "plugins");
		expect(p.platform).toBe("windows8");
    });	
	
    it('get wp8 project', function() {

		var p = project.forPlatform("wp8", "projects/wp8", "plugins");
		expect(p.platform).toBe("wp8");
    });	
		
});
