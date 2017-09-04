function objToMesh(objText, mtlText, texturePath, viewer, callback) {
    function setMaterialAttribute(attribute, args) {
        args = args.split(' ');
        for (var i = 0; i < args.length; i++) {
            attribute[i] = parseFloat(args[i]);
        }
    }
    function setTexture(onloadFunction, textureName, submesh) {
        var texture = new Image();
        texture.onload = function() {
            makePowerOf2Image(this, function(po2Image) {
                onloadFunction(po2Image, submesh);
            });
        };
        texture.src = texturePath + '/' + textureName;
    }
    function addArgsToArray(arr, args) {
        args = args.split(' ');
        args.forEach(function(arg) {
            arr.push(parseFloat(arg));
        });
    }
    function createFace(faceArray, positionArray, normalArray, uvArray, arg1, arg2, arg3) {
        function tripleFromArray(arr, index) {
            index--;// Because obj's indices start at 1.
            return [arr[index * 3], arr[index * 3 + 1], arr[index * 3 + 2]];
        }
        function doubleFromArray(arr, index) { 
            index--;// Because obj's indices start at 1.
            return [arr[index * 2], 1 - arr[index * 2 + 1]];
            // 1 - v because openGl loves flipping vertical texture coordinate.
        }
        var newFace = new Face();
        var vArgs1 = arg1.split('/');
        var vArgs2 = arg2.split('/');
        var vArgs3 = arg3.split('/');
        newFace.positions = [];
        newFace.normals = [];
        newFace.positions.push(tripleFromArray(positionArray, vArgs1[0]));
        newFace.positions.push(tripleFromArray(positionArray, vArgs2[0]));
        newFace.positions.push(tripleFromArray(positionArray, vArgs3[0]));
        if (vArgs1.length > 1 && vArgs1[1] !== '') { // If we have uv information.
            newFace.uvs = [];
            newFace.uvs.push(doubleFromArray(uvArray, vArgs1[1]));
            newFace.uvs.push(doubleFromArray(uvArray, vArgs2[1]));
            newFace.uvs.push(doubleFromArray(uvArray, vArgs3[1]));
        }
        if (vArgs1.length == 3) { // If we have all pos, nrm, and uv.
            newFace.normals.push(tripleFromArray(normalArray, vArgs1[2]));
            newFace.normals.push(tripleFromArray(normalArray, vArgs2[2]));
            newFace.normals.push(tripleFromArray(normalArray, vArgs3[2]));
        } else { // If we don't have normals.
            //v12 = p2 - p1
            //v13 = p3 - p1
            var v12 = $V(newFace.positions[1]).subtract($V(newFace.positions[0]));
            var v13 = $V(newFace.positions[2]).subtract($V(newFace.positions[0]));
            var normal = v12.cross(v13).normalize();
            // Push 3 times to cover each vertex.
            newFace.normals.push(normal.flatten());
            newFace.normals.push(normal.flatten());
            newFace.normals.push(normal.flatten());
            //console.log(normal.flatten());
        }
        faceArray.push(newFace);
    }
    
    var newMesh = new Mesh(viewer);
    var submeshTable = {};
    var mtlLines = mtlText.split('\n');
    var currentSubmesh;
    // Create submeshes based off of materials.
    mtlLines.forEach(function(mtlLine) {
        mtlLine = mtlLine.trim().replace(/\s+/, ' ');
        if (mtlLine.startsWith('newmtl ')) {
            currentSubmesh = new Submesh(newMesh);
            mtlLine = mtlLine.substring('newmtl '.length);
            currentSubmesh.name = mtlLine;
            submeshTable[mtlLine] = currentSubmesh;
        } else if (mtlLine.startsWith('Ns ')) {
            mtlLine = mtlLine.substring('Ns '.length);
            currentSubmesh.gloss = parseFloat(mtlLine) / 1000;
        } else if (mtlLine.startsWith('d ')) {
            mtlLine = mtlLine.substring('d '.length);
            currentSubmesh.dissolve = parseFloat(mtlLine);
        } else if (mtlLine.startsWith('Ka ')) {
            mtlLine = mtlLine.substring('Ka '.length);
            setMaterialAttribute(currentSubmesh.ambient, mtlLine);
        } else if (mtlLine.startsWith('Kd ')) {
            mtlLine = mtlLine.substring('Kd '.length);
            setMaterialAttribute(currentSubmesh.diffuse, mtlLine);
        } else if (mtlLine.startsWith('Ks ')) {
            mtlLine = mtlLine.substring('Ks '.length);
            setMaterialAttribute(currentSubmesh.specular, mtlLine);
        } else if (mtlLine.startsWith('Ke ')) {
            mtlLine = mtlLine.substring('Ke '.length);
            setMaterialAttribute(currentSubmesh.emission, mtlLine);
        } else if (mtlLine.startsWith('map_Ka ')) {
            mtlLine = mtlLine.substring('map_Ka '.length);
            setTexture(function(image, submesh) {
                    submesh.occlusion2D = createTexture(viewer.gl, image);
                }, mtlLine, currentSubmesh); 
        } else if (mtlLine.startsWith('map_Kd ')) {
            mtlLine = mtlLine.substring('map_Kd '.length);
            setTexture(function(image, submesh) {
                    submesh.diffuse2D = createTexture(viewer.gl, image);
                }, mtlLine, currentSubmesh); 
        } else if (mtlLine.startsWith('map_Ks ')) {
            mtlLine = mtlLine.substring('map_Ks '.length);
            setTexture(function(image, submesh) {
                    submesh.specular2D = createTexture(viewer.gl, image);
                }, mtlLine, currentSubmesh); 
        } else if (mtlLine.startsWith('map_Ns ')) {
            mtlLine = mtlLine.substring('map_Ns '.length);
            setTexture(function(image, submesh) {
                    submesh.gloss2D = createTexture(viewer.gl, image);
                }, mtlLine, currentSubmesh);
        } else if (mtlLine.startsWith('map_Ke ')) {
            mtlLine = mtlLine.substring('map_Ke '.length);
            setTexture(function(image, submesh) {
                    submesh.emission2D = createTexture(viewer.gl, image);
                }, mtlLine, currentSubmesh);
        } else if (mtlLine.startsWith('map_Bump ')) {
            mtlLine = mtlLine.substring('map_Bump '.length);
            if (mtlLine.startsWith('-bm ')) {
                mtlLine = mtlLine.substring('-bm  '.length);
                var nextSpace = mtlLine.indexOf(' ');
                currentSubmesh.normalMultiplier = parseFloat(mtlLine.substring(0, nextSpace));
                mtlLine = mtlLine.substring(nextSpace + 1);
            }
            setTexture(function(image, submesh) {
                    submesh.normal2D = createTexture(viewer.gl, image);
                }, mtlLine, currentSubmesh);
        }
    });
    
    var positionArray = [];
    var normalArray = [];
    var uvArray = [];
    var minX, maxX, minY, maxY, minZ, maxZ;
    minX = minY = minZ = Number.MAX_VALUE;
    maxX = maxY = maxZ = Number.MIN_VALUE;
    // Create geometry.
    var objLines = objText.split('\n');
    objLines.forEach(function(objLine) {
        objLine = objLine.trim().replace(/\s+/, ' ');
        if (objLine.startsWith('v ')) {
            objLine = objLine.substring('v '.length);
            //addArgsToArray(positionArray, objLine);
            // Treat the positions a little differently because we need to extract the min max.
            var args = objLine.split(' ');
            args.forEach(function(arg) {
                positionArray.push(parseFloat(arg));
            });
            if (args[0] < minX) minX = args[0];
            if (args[0] > maxX) maxX = args[0];
            if (args[1] < minY) minY = args[1];
            if (args[1] > maxY) maxY = args[1];
            if (args[2] < minZ) minZ = args[2];
            if (args[2] > maxZ) maxZ = args[2];
        } else if (objLine.startsWith('vn ')) {
            objLine = objLine.substring('vn '.length);
            addArgsToArray(normalArray, objLine);
        } else if (objLine.startsWith('vt ')) {
            objLine = objLine.substring('vt '.length);
            addArgsToArray(uvArray, objLine);
        } else if (objLine.startsWith('usemtl ')) {
            objLine = objLine.substring('usemtl '.length);
            currentSubmesh = submeshTable[objLine];
        } else if (objLine.startsWith('f ')) {
            objLine = objLine.substring('f '.length);
            var args = objLine.split(' ');
            // Create faces in a fan strip fashion.
            for (var i = 1; i <= args.length - 2; i++) {
                createFace(currentSubmesh.faces, positionArray, normalArray, uvArray,
                        args[0], args[i], args[i + 1]);
            }
        }
    });
    var maxSize = Math.max(maxX - minX, Math.max(maxY - minY, maxZ - minZ));
    var scale = 3 / maxSize;
    newMesh.scale = $V([scale, scale, scale]);
    newMesh.processGeometry();
    callback(newMesh);
    //return newMesh;
}

/*function loadOBJ(path, objFileName, mtlFileName, viewer, callback) {
    var obj, mtl;
    // Load materials first.
    ajaxGet("get-file.php?fileName=" + path + mtlFileName, function(mtlResponse) {
        mtl = mtlResponse;
        ajaxGet("get-file.php?fileName=" + path + objFileName, function(objResponse) {
            obj = objResponse;
            callback(objToMesh(obj, mtl, path, viewer));
        }, true);
    }, true);
    
}*/