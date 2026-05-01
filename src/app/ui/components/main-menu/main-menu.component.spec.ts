import { IMock, Mock, Times } from 'typemoq';
import { MainMenuComponent } from './main-menu.component';
import { NavigationServiceBase } from '../../../services/navigation/navigation.service.base';
import { UpdateServiceBase } from '../../../services/update/update.service.base';
import { DesktopBase } from '../../../common/io/desktop.base';
import { IndexingService } from '../../../services/indexing/indexing.service';

describe('MainMenuComponent', () => {
    let navigationServiceMock: IMock<NavigationServiceBase>;
    let updateServiceMock: IMock<UpdateServiceBase>;
    let desktopMock: IMock<DesktopBase>;
    let indexingServiceMock: IMock<IndexingService>;

    let component: MainMenuComponent;

    beforeEach(() => {
        navigationServiceMock = Mock.ofType<NavigationServiceBase>();
        updateServiceMock = Mock.ofType<UpdateServiceBase>();
        desktopMock = Mock.ofType<DesktopBase>();
        indexingServiceMock = Mock.ofType<IndexingService>();

        component = new MainMenuComponent(
            navigationServiceMock.object,
            updateServiceMock.object,
            desktopMock.object,
            indexingServiceMock.object,
        );
    });

    describe('constructor', () => {
        it('should create', () => {
            // Arrange

            // Act

            // Assert
            expect(component).toBeDefined();
        });

        it('should define updateService', () => {
            // Arrange

            // Act

            // Assert
            expect(component.updateService).toBeDefined();
        });
    });

    describe('applicationName', () => {
        it('should provide correct application name', () => {
            // Arrange

            // Act

            // Assert
            expect(component.applicationName).toEqual('Dopamine');
        });
    });

    describe('goToManageCollection', () => {
        it('should navigate to manage collection', async () => {
            // Arrange

            // Act
            await component.goToManageCollectionAsync();

            // Assert
            navigationServiceMock.verify((x) => x.navigateToManageCollectionAsync(), Times.exactly(1));
        });
    });

    describe('goToSettings', () => {
        it('should navigate to settings', async () => {
            // Arrange

            // Act
            await component.goToSettingsAsync();

            // Assert
            navigationServiceMock.verify((x) => x.navigateToSettingsAsync(), Times.exactly(1));
        });
    });

    describe('refreshCollectionNow', () => {
        it('should refresh the collection', () => {
            // Arrange

            // Act
            component.refreshCollectionNow();

            // Assert
            indexingServiceMock.verify((x) => x.indexCollectionAlways(), Times.exactly(1));
        });
    });

    describe('goToInformation', () => {
        it('should navigate to information', async () => {
            // Arrange

            // Act
            await component.goToInformationAsync();

            // Assert
            navigationServiceMock.verify((x) => x.navigateToInformationAsync(), Times.exactly(1));
        });
    });

    describe('downloadLatestRelease', () => {
        it('should download the latest release', async () => {
            // Arrange

            // Act
            await component.downloadLatestReleaseAsync();

            // Assert
            updateServiceMock.verify((x) => x.downloadLatestReleaseAsync(), Times.exactly(1));
        });
    });
});
